// Captura el documento (HTML) a PDF tamaño carta, partiendo en páginas sin cortar filas, párrafos, títulos ni firmas
// (migrado de InnovaGestión: pdfDesde). html2canvas 1.4.1 fijo desde cdnjs, se carga solo al generar.
/* eslint-disable */
const H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
function cargarH2C(){ if(window.html2canvas) return Promise.resolve(); return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=H2C; s.onload=function(){res();}; s.onerror=function(){rej(new Error('No se pudo cargar el generador de PDF. Revisa la conexión.'));}; document.head.appendChild(s); }); }
export function pdfDesde(el, jsPDF){
    return cargarH2C().then(function(){
      var doc=new jsPDF({unit:'mm',format:'letter',compress:true}), A4W=215.9, A4H=279.4;
      return window.html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false}).then(function(cv){
        var imgH=cv.height*A4W/cv.width, partes=el.querySelectorAll(':scope > .dg-una'), R0=el.getBoundingClientRect(), segs=[0];
        Array.prototype.forEach.call(partes,function(p,i){ if(i>0) segs.push(Math.round((p.getBoundingClientRect().top-R0.top)*cv.height/R0.height)); }); segs.push(cv.height);
        if(imgH<=A4H){ doc.addImage(cv.toDataURL('image/jpeg',0.92),'JPEG',0,0,A4W,imgH); return doc; }
        var MT=10, MB=8, srcPageH=Math.floor(cv.width*(A4H-MB)/A4W), srcPageH2=Math.floor(cv.width*(A4H-MT-MB)/A4W), y=0, first=true, ctx=cv.getContext('2d');
        // Bloques que no se pueden partir (filas, párrafos, títulos, firmas…), en px del canvas: el corte de página se hace entre ellos.
        var kpx=cv.height/R0.height, bloques=[];
        Array.prototype.forEach.call(el.querySelectorAll('tr,p,li,.dg-h4,.dg-h,.pts-tit,.pts-fig,.pts-figs,.dg-firmas,.dg-sig,.dg-box,.mr-res,figure,.dg-foot,.dg-cols'),function(b){ var r=b.getBoundingClientRect(); if(r.height>0) bloques.push([(r.top-R0.top)*kpx,(r.bottom-R0.top)*kpx,b.classList.contains('dg-h4')||b.classList.contains('ries-g')||b.classList.contains('iper-g')||b.classList.contains('irl-g')]); });
        function corteDom(y0,hMax){ var c=y0+hMax, mov=true, k=0;
          while(mov && k++<60){ mov=false;
            for(var i=0;i<bloques.length;i++){ var b=bloques[i]; if(b[1]-b[0]>=hMax*0.9 || b[0]<=y0+2) continue;
              if(b[0]<c-1 && b[1]>c+1){ c=Math.floor(b[0]); mov=true; }
              else if(b[2] && b[1]<=c && c-b[1]<hMax*0.07){ c=Math.floor(b[0]); mov=true; } } }   // un título no queda solo al pie
          return (c-y0>hMax*0.3) ? c-y0 : corte(y0,hMax); }
        // Corta la página en una franja blanca (sin texto) para no partir líneas por la mitad.
        function corte(y0,hMax){ var band=Math.floor(hMax*0.18), top=y0+hMax-band;
          try{ var d=ctx.getImageData(0,top,cv.width,band).data, W=cv.width;
            function blanca(r,lim){ for(var x=0;x<W;x+=3){ var i=(r*W+x)*4; if(d[i]<lim||d[i+1]<lim||d[i+2]<lim) return false; } return true; }
            // borde horizontal de una tabla: fila clara con muchos píxeles grises (se corta justo debajo, entre filas)
            function borde(r){ var g=0,n=0; for(var x=0;x<W;x+=3){ var i=(r*W+x)*4; if(d[i]<215||d[i+1]<215||d[i+2]<215) return false; n++; if(d[i]<246) g++; } return g>n*0.5; }
            function naranja(r){ for(var x=0;x<W;x+=6){ var i=(r*W+x)*4; if(d[i]>220&&d[i+1]>80&&d[i+1]<140&&d[i+2]<70) return true; } return false; }
            // 1° franja totalmente blanca (entre bloques); 2° franja clara (entre líneas dentro de una tabla)
            for(var pase=0;pase<3;pase++){ var lim=pase===2?215:248;
              for(var r=band-1;r>=0;r--){ if(pase===1){ if(!borde(r)) continue; } else if(!blanca(r,lim)) continue;
                // si justo arriba hay un título de sección (barra naranja), cortar antes del título para que no quede solo
                var tit=-1; for(var q=r-1;q>=Math.max(0,r-Math.round(W*0.07));q--){ if(naranja(q)){ tit=q; break; } }
                if(tit<0) return r+(hMax-band)+1;
                r=tit; } }
          }catch(_){}
          return hMax; }
        function soloBlanco(y0,hh){ try{ var dd=ctx.getImageData(0,y0,cv.width,hh).data; for(var i=0;i<dd.length;i+=4*7){ if(dd[i]<240||dd[i+1]<240||dd[i+2]<240) return false; } return true; }catch(_){ return false; } }
        for(var sg=0;sg<segs.length-1;sg++){ y=segs[sg]; var fin=segs[sg+1];
        while(y<fin){
          var PH=first?srcPageH:srcPageH2, h=Math.min(PH,fin-y), resto=fin-y-PH;
          // si a la última página le quedaría muy poco (p. ej. solo el pie), se corta antes para equilibrar
          if(resto>0) h=corteDom(y, resto<PH*0.12 ? Math.round(PH*0.85) : PH);
          if(!first && soloBlanco(y,h)) break;   // no agregar una última página vacía (solo margen)
          var sl=document.createElement('canvas'); sl.width=cv.width; sl.height=h;
          sl.getContext('2d').drawImage(cv,0,y,cv.width,h,0,0,cv.width,h);
          var top=first?0:MT; if(!first) doc.addPage(); first=false;
          doc.addImage(sl.toDataURL('image/jpeg',0.92),'JPEG',0,top,A4W,h*A4W/cv.width);
          y+=h;
        }
        }
        return doc;
      });
    });
  }
