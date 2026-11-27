# encoding: UTF-8
# SOLO LECTURA del modelo: saca el inventario (muebles, piezas y materiales visibles, con su posición) y las mallas
# 3D de los muebles, y los ENVÍA DIRECTO a ISgestión (Proyectos → Modelo SketchUp). No cambia nada del modelo ni
# escribe archivos. Misma forma de contar que exportar_al_cotizador.rb del prototipo.
#
# Uso: con el modelo abierto, en la Consola de Ruby (Ventana → Consola de Ruby):
#   load 'C:/Users/Acer/Documents/ISgestion/modulos/proyectos/sketchup/enviar_a_isgestion.rb'
# La primera vez pide el código de conexión del proyecto (ISgestión → Proyectos → Modelo SketchUp → Conectar SketchUp)
# y lo recuerda para ese archivo .skp (en las preferencias de SketchUp, no en el modelo). Después queda en el menú
# Extensiones → Enviar a ISgestión. Las mallas que ya están en ISgestión no se vuelven a enviar, salvo que el mueble
# haya cambiado: cada malla lleva una firma (MD5 de su contenido) y se reenvía la que no coincide (Proyectos 005).
#
# Cómo cuenta:
#   - Cada componente (muebles de biblioteca, IKEA, sillas, etc.) cuenta como 1 unidad.
#   - Los grupos sin grupos adentro (listones, paneles, cubiertas...) son piezas, juntando las del mismo nombre,
#     grupo padre y medidas.
#   - Solo lo visible: lo que está en etiquetas apagadas u oculto no se cuenta.

require 'json'
require 'net/http'
require 'uri'
require 'zlib'
require 'base64'
require 'stringio'
require 'digest'
require 'tmpdir'

module EnviarAISgestion
  URL = URI('https://qipfzftvojxfsecjqdzh.supabase.co/functions/v1/proyectos-sketchup')
  PREF = 'ISgestion'
  MAX_POS = 400
  MAX_CAJAS = 3000
  MAX_TRIANGULOS = 150_000
  RECINTOS_P7 = [
    ['Sala de reuniones norte', 22000, 35600], ['Cafetería', 20500, 9500], ['Zona 1 - Sala auditorio', 13000, 35600],
    ['Sala de reuniones (Volcán Osorno)', 9870, 30149], ['Sala de lactancia', 15330, 31100], ['Oficina 1', 9329, 26364],
    ['Oficina 2', 10816, 26364], ['Zona 2', 10816, 20875], ['Zona 3 - Casino', 12709, 8166],
    ['Hall ascensores', 17441, 17846], ['Kitchenette', 18387, 13925], ['SSHH damas', 20280, 14872],
    ['SSHH varones', 21091, 13249], ['Oficina', 16765, 13925], ['3 estaciones', 24877, 15548]
  ].freeze
  GRUPOS_ZONA_P7 = {
    'Casino y cocina' => 'Zona 3 - Casino y cocina', 'Zona 2 y pasillo casino' => 'Zona 2 - Cafetería y estar',
    'Hall ascensores y accesos' => 'Hall ascensores', 'Sala Volcán Osorno' => 'Sala de reuniones (Volcán Osorno)',
    'Sala Volcán Puntiagudo' => 'Sala Volcán Puntiagudo', 'Sala de estar - repisas escalonadas' => 'Zona 2 - Cafetería y estar',
    'Mueble atrás - BESTÅ 240 roble espigado' => 'Zona 1 - Sala auditorio', 'Zona 1 - cielo madera modificado' => 'Zona 1 - Sala auditorio',
    'Zona 1 (lámina ARQ-02)' => 'Zona 1 - Sala auditorio'
  }.freeze

  def self.slug(texto)
    texto.to_s.unicode_normalize(:nfd).gsub(/\p{Mn}/, '').downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-+|-+\z/, '')[0, 40]
  end

  # Código del modelo: el piso 7 de CERMAQ conserva 'p7' (el del prototipo); los demás, el nombre del archivo.
  def self.codigo(model)
    up = model.path.to_s.upcase
    return 'p7' if up.include?('EDIFICIO CERMAQ') && File.basename(up) == 'MODELADO.SKP'
    c = slug(File.basename(model.path.to_s, '.*'))
    c.empty? ? 'modelo' : c
  end

  # ---------------------------------------------------------------- Inventario (igual que el exportador del prototipo)
  def self.contenedor?(e)
    e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
  end

  def self.nombre(e)
    n = e.name.to_s.strip
    return n unless n.empty?
    e.is_a?(Sketchup::ComponentInstance) ? e.definition.name : '(grupo sin nombre)'
  end

  def self.medidas(e, t)
    b = e.definition.bounds
    sx = Geom::Vector3d.new(1, 0, 0).transform(t).length
    sy = Geom::Vector3d.new(0, 1, 0).transform(t).length
    sz = Geom::Vector3d.new(0, 0, 1).transform(t).length
    [b.width * sx, b.height * sy, b.depth * sz].map { |v| (v.to_cm * 10).round / 10.0 }
  end

  def self.recinto(centro, ruta)
    if @codigo == 'p7'
      ruta.each { |r| return GRUPOS_ZONA_P7[r] if GRUPOS_ZONA_P7[r] }
      x = centro.x.to_mm
      y = centro.y.to_mm
      RECINTOS_P7.min_by { |_, rx, ry| (rx - x)**2 + (ry - y)**2 }.first
    else
      ruta.first || 'General'
    end
  end

  def self.recorrer(ents, tr, ruta, items)
    ents.each do |e|
      next unless contenedor?(e)
      next if e.hidden? || !e.layer.visible?
      t = tr * e.transformation
      n = nombre(e)
      if e.is_a?(Sketchup::ComponentInstance)
        if medidas(e, t).max > 400 && e.definition.entities.any? { |h| contenedor?(h) }
          recorrer(e.definition.entities, t, ruta + [n], items)
        else
          anotar(e, t, ruta, n, 'componente', items)
        end
        next
      end
      if e.definition.entities.any? { |h| contenedor?(h) }
        anotar(e, t, ruta, n, 'conjunto', items) unless e.name.to_s.strip.empty?
        recorrer(e.definition.entities, t, ruta + [n], items)
      else
        anotar(e, t, ruta, n, 'pieza', items)
      end
    end
  end

  def self.anotar(e, t, ruta, n, tipo, items)
    med = medidas(e, t)
    centro = e.definition.bounds.center.transform(t)
    rec = recinto(centro, ruta + (tipo == 'conjunto' ? [n] : []))
    padre = ruta.last.to_s
    clave = [rec, padre, n, med.sort.reverse.join('x')].join('|')
    it = items[clave] ||= { 'clave' => clave, 'recinto' => rec, 'grupo_modelo' => ruta.first.to_s, 'padre' => padre,
                            'nombre' => n, 'tipo' => tipo, 'medidas_cm' => med.sort.reverse, 'cant' => 0,
                            'etiqueta' => capa(e, @capa_ruta), 'material' => (e.material ? e.material.display_name : nil) }
    it['cant'] += 1
    if tipo != 'pieza' && med.max.between?(15, 400)
      id = ('m' + e.definition.guid.gsub(/[^0-9A-Za-z]/, '')[0, 24]).downcase + 'v3'
      it['m3d'] ||= id
      @m3d[id] ||= { 'def' => e.definition, 'escala' => escala(t), 'nombre' => n }
      it['pos'] ||= []
      it['pos'] << posicion(t) if it['pos'].size < MAX_POS
    elsif tipo == 'pieza'
      it['cajas'] ||= []
      it['cajas'] << caja(e, t) if it['cajas'].size < MAX_CAJAS
      it['color'] ||= color(e)
    end
  end

  def self.r1(v)
    (v * 10).round / 10.0
  end

  def self.posicion(t)
    o = t.origin
    ejes = [X_AXIS, Y_AXIS, Z_AXIS].map { |a| a.transform(t).normalize }
    [r1(o.x.to_cm), r1(o.y.to_cm), r1(o.z.to_cm)] + ejes.flat_map { |v| [v.x.round(4), v.y.round(4), v.z.round(4)] }
  end

  def self.caja(e, t)
    bb = e.definition.bounds
    c0 = bb.min.transform(t)
    lados = [Geom::Vector3d.new(bb.width, 0, 0), Geom::Vector3d.new(0, bb.height, 0), Geom::Vector3d.new(0, 0, bb.depth)].map { |v| v.transform(t) }
    [r1(c0.x.to_cm), r1(c0.y.to_cm), r1(c0.z.to_cm)] + lados.flat_map { |v| [r1(v.x.to_cm), r1(v.y.to_cm), r1(v.z.to_cm)] }
  end

  def self.color(e)
    m = e.material
    unless m
      cuenta = Hash.new(0)
      e.definition.entities.grep(Sketchup::Face).each do |f|
        mm = f.material || f.back_material
        cuenta[mm] += f.area if mm
      end
      m = cuenta.max_by { |_, a| a }&.first
    end
    m ? [m.color.red, m.color.green, m.color.blue] : nil
  end

  def self.escala(t)
    Geom::Transformation.scaling(Geom::Vector3d.new(1, 0, 0).transform(t).length,
                                 Geom::Vector3d.new(0, 1, 0).transform(t).length,
                                 Geom::Vector3d.new(0, 0, 1).transform(t).length)
  end

  # ---------------------------------------------------------------- Caras, materiales y texturas
  def self.r4(v)
    (v * 10_000).round / 10_000.0
  end

  # Etiqueta efectiva de una entidad: la suya o, si no tiene (capa 0), la de quien la contiene
  def self.capa(e, padre)
    l = e.layer
    l.nil? || l == @capa0 ? (padre || 'Sin etiqueta') : l.name
  end

  # Material de una cara: el del frente, el del reverso o el heredado del grupo que la contiene
  def self.material_de(e, mat_padre)
    return [e.material, :frente] if e.material
    return [e.back_material, :reverso] if e.back_material
    [mat_padre, :heredado]
  end

  def self.textura_id(m)
    id = 'tx' + Digest::MD5.hexdigest(m.name.to_s)[0, 16]
    @texturas[id] ||= m
    id
  end

  # Grupo de triángulos de un material (con 't' y 'uv' si tiene textura)
  def self.grupo_material(acc, clave, m, gris)
    acc[clave] ||= begin
      g = { 'c' => m ? [m.color.red, m.color.green, m.color.blue] : gris, 'a' => m ? m.alpha.round(2) : 1.0, 'p' => [] }
      if m&.texture
        g['t'] = textura_id(m)
        g['uv'] = []
      end
      g
    end
  end

  # Agrega los triángulos de una cara al grupo (posiciones en cm con conv y, si hay textura, sus coordenadas).
  # Devuelve cuántos triángulos agregó.
  def self.agregar_cara(e, tr, m, modo, g)
    con_uv = g.key?('uv')
    flags = con_uv && modo != :heredado ? (modo == :reverso ? 2 : 1) : 0
    malla = e.mesh(flags)
    pts = malla.points.map { |q| pt(q.transform(tr)) }
    uvs = nil
    if con_uv
      if modo == :heredado
        # Material del grupo: la cara no trae coordenadas de textura; se proyecta sobre su propio plano
        t = m.texture
        ejes = e.normal.axes
        uvs = malla.points.map do |q|
          v = Geom::Vector3d.new(q.x, q.y, q.z)
          [r4(v.dot(ejes[0]) / t.width), r4(v.dot(ejes[1]) / t.height)]
        end
      else
        frente = modo != :reverso
        uvs = (1..malla.count_points).map do |k|
          u = malla.uv_at(k, frente)
          q = u.z.zero? ? 1.0 : u.z
          [r4(u.x / q), r4(u.y / q)]
        end
      end
    end
    n = 0
    malla.polygons.each do |pol|
      next unless pol.size == 3
      pol.each do |k|
        g['p'].concat(pts[k.abs - 1])
        g['uv'].concat(uvs[k.abs - 1]) if uvs
      end
      n += 1
    end
    n
  rescue StandardError
    0
  end

  # Triángulos de un mueble por material, en cm y en coordenadas propias del mueble
  def self.mallas(ents, tr, mat_padre, acc, cuenta)
    ents.each do |e|
      if e.is_a?(Sketchup::Face)
        next if e.hidden? || !e.layer.visible?
        m, modo = material_de(e, mat_padre)
        g = grupo_material(acc, m ? m.name : '', m, [205, 205, 200])
        cuenta[0] += agregar_cara(e, tr, m, modo, g)
        return if cuenta[0] > MAX_TRIANGULOS
      elsif contenedor?(e)
        next if e.hidden? || !e.layer.visible?
        mallas(e.definition.entities, tr * e.transformation, e.material || mat_padre, acc, cuenta)
      end
    end
  end

  # ---------------------------------------------------------------- Construcción (todo lo que no es mueble)
  # Muros, pisos, cielos, piezas y la geometría suelta, con su forma real y sus líneas, en coordenadas del modelo
  # (cm). Los muebles no van aquí: se envían aparte (una malla por mueble) para poder hacerles clic y cotizarlos.
  # Se envía en partes de hasta TRIS_PARTE triángulos, comprimidas (gzip).
  TRIS_PARTE = 250_000

  # ¿Este grupo o componente se envía como mueble (malla propia)? Mismo criterio que recorrer y anotar.
  def self.mueble?(e, t)
    med = medidas(e, t)
    hijos = e.definition.entities.any? { |h| contenedor?(h) }
    if e.is_a?(Sketchup::ComponentInstance)
      return false if med.max > 400 && hijos
      med.max.between?(15, 400)
    else
      hijos && !e.name.to_s.strip.empty? && med.max.between?(15, 400)
    end
  end

  def self.pt(q)
    [r1(q.x.to_cm), r1(q.y.to_cm), r1(q.z.to_cm)]
  end

  # obj: { 'n' => nombre, 'm' => medidas, 'r' => ruta, 'k' => llave única } del grupo o componente más cercano
  def self.escena(ents, tr, mat_padre, etiqueta, obj, ruta)
    ents.each do |e|
      if e.is_a?(Sketchup::Face)
        next if e.hidden? || !e.layer.visible?
        m, modo = material_de(e, mat_padre)
        cap = capa(e, etiqueta)
        g = grupo_material(@esc_acc, "#{cap}|#{m ? m.name : ''}", m, [225, 225, 220])
        g['e'] = cap
        g['o'] ||= []
        idx = (@esc_obj_idx[obj['k']] ||= (@esc_objs << { 'n' => obj['n'], 'm' => obj['m'], 'e' => cap, 'r' => obj['r'] }).size - 1)
        n = agregar_cara(e, tr, m, modo, g)
        n.times { g['o'] << idx }
        @esc_tris += n
        @esc_enviar.call if @esc_tris >= TRIS_PARTE
      elsif e.is_a?(Sketchup::Edge)
        next if e.hidden? || e.soft? || e.smooth? || !e.layer.visible?
        (@esc_lineas[capa(e, etiqueta)] ||= []).concat(pt(e.start.position.transform(tr)), pt(e.end.position.transform(tr)))
      elsif contenedor?(e)
        next if e.hidden? || !e.layer.visible?
        t = tr * e.transformation
        next if mueble?(e, t)
        n = nombre(e)
        hijo = { 'n' => n, 'm' => medidas(e, t).sort.reverse, 'r' => ruta.join(' > '), 'k' => "#{obj['k']}/#{e.persistent_id}" }
        escena(e.definition.entities, t, e.material || mat_padre, capa(e, etiqueta), hijo, ruta + [n])
      end
    end
  end

  # Imagen de una textura (archivo temporal que se borra al leerlo). nil si SketchUp no la puede escribir.
  def self.imagen_textura(m)
    ext = File.extname(m.texture.filename.to_s).downcase
    ext = '.png' unless %w[.jpg .jpeg .png].include?(ext)
    ruta = File.join(Dir.tmpdir, "isg-#{Digest::MD5.hexdigest(m.name.to_s)}#{ext}")
    return nil unless m.texture.write(ruta, false)
    datos = File.binread(ruta)
    File.delete(ruta) rescue nil
    [datos, ext == '.png' ? 'png' : 'jpg']
  rescue StandardError
    nil
  end

  def self.gzip64(texto)
    io = StringIO.new
    gz = Zlib::GzipWriter.new(io)
    gz.write(texto)
    gz.close
    Base64.strict_encode64(io.string)
  end

  # ---------------------------------------------------------------- Envío
  def self.clave_pref(model)
    'codigo_' + slug(model.path.to_s.empty? ? 'sin-guardar' : model.path.to_s)
  end

  def self.pedir_codigo(model, motivo = nil)
    # El título de la ventana va corto: en Windows un título largo con saltos de línea puede dejarla sin mostrarse
    UI.messagebox("#{motivo}\n\nPega de nuevo el código de conexión.") if motivo
    puts 'Enviar a ISgestión: pega el código de conexión en la ventana que se abrió.'
    r = UI.inputbox(['Código de conexión (ISgestión > Proyectos > Modelo SketchUp > Conectar SketchUp)'], [''], 'Enviar a ISgestión')
    return nil unless r
    c = r[0].to_s.strip
    return nil if c.empty?
    Sketchup.write_default(PREF, clave_pref(model), c)
    c
  end

  def self.post(http, cuerpo)
    req = Net::HTTP::Post.new(URL.request_uri, 'Content-Type' => 'application/json')
    req.body = JSON.generate(cuerpo)
    res = http.request(req)
    d = begin
      JSON.parse(res.body.to_s)
    rescue StandardError
      {}
    end
    raise ErrorCodigo, d['error'].to_s if res.code.to_i == 401
    raise d['error'] || "Error #{res.code} de ISgestión" unless res.is_a?(Net::HTTPSuccess)
    d
  end

  class ErrorCodigo < StandardError; end

  def self.enviar
    puts 'Enviar a ISgestión: comenzando…'
    model = Sketchup.active_model
    return UI.messagebox('Guarda el modelo antes de enviarlo a ISgestión.') if model.path.to_s.empty?
    puts "Enviar a ISgestión: modelo #{File.basename(model.path)}"
    codigo_conexion = Sketchup.read_default(PREF, clave_pref(model), '').to_s
    codigo_conexion = pedir_codigo(model) if codigo_conexion.empty?
    return UI.messagebox('Envío cancelado: no se cambió nada.') unless codigo_conexion

    @codigo = codigo(model)
    @capa0 = model.layers[0]
    @capa_ruta = nil
    @texturas = {}
    items = {}
    @m3d = {}
    Sketchup.status_text = 'Leyendo el modelo para ISgestión…'
    puts 'Enviar a ISgestión: leyendo el modelo (puede tardar un poco)…'
    recorrer(model.entities, Geom::Transformation.new, [], items)
    lista = items.values.sort_by { |i| [i['recinto'], i['grupo_modelo'], i['padre'], i['nombre']] }
    fecha = Time.now.strftime('%d-%m-%Y %H:%M')

    http = Net::HTTP.new(URL.host, URL.port)
    http.use_ssl = true
    http.open_timeout = 30
    http.read_timeout = 180
    nuevas = 0
    inicio = nil
    http.start do |h|
      begin
        inicio = post(h, { t: codigo_conexion, accion: 'inicio', codigo: @codigo, archivo: model.path, fecha: fecha })
      rescue ErrorCodigo => err
        codigo_conexion = pedir_codigo(model, err.message)
        return UI.messagebox('Envío cancelado: no se cambió nada.') unless codigo_conexion
        inicio = post(h, { t: codigo_conexion, accion: 'inicio', codigo: @codigo, archivo: model.path, fecha: fecha })
      end
      ya = inicio['mallas'].to_a
      # Firma de cada malla en ISgestión (nil: ISgestión sin firmas; entonces solo se envían las que faltan)
      firmas = inicio['firmas'].is_a?(Hash) ? inicio['firmas'] : nil
      puts "Enviar a ISgestión: conectado al proyecto \"#{inicio['proyecto']}\" (#{ya.size} muebles 3D ya estaban)"
      # El guid de la definición no cambia al editar un mueble: se arma la malla, se calcula su firma y se envía solo
      # si falta o no coincide con la de ISgestión (forma, medidas, materiales o texturas distintas)
      revisar = firmas ? @m3d.to_a : @m3d.reject { |id, _| ya.include?(id) }.to_a
      cambiadas = 0
      revisar.each_with_index do |(id, c), k|
        Sketchup.status_text = "Revisando 3D para ISgestión: #{k + 1} de #{revisar.size} (#{c['nombre']})"
        acc = {}
        mallas(c['def'].entities, c['escala'], nil, acc, [0])
        datos = { 'v' => 2, 'u' => 'cm', 'mats' => acc.values.reject { |g| g['p'].empty? } }
        next if datos['mats'].empty?
        firma = Digest::MD5.hexdigest(JSON.generate(datos))
        next if firmas && firmas[id] == firma
        cambio = ya.include?(id)
        puts "  3D #{cambio ? 'cambiado' : 'nuevo'}: #{c['nombre']}"
        post(h, { t: codigo_conexion, accion: 'malla', modelo_id: inicio['modelo_id'], m3d: id, nombre: c['nombre'], datos: datos, firma: firma })
        nuevas += 1
        cambiadas += 1 if cambio
      end
      @cambiadas = cambiadas
      # Construcción completa (muros, pisos, cielos, piezas), en partes comprimidas
      partes = []
      @esc_acc = {}
      @esc_lineas = {}
      @esc_objs = []
      @esc_obj_idx = {}
      @esc_tris = 0
      @esc_enviar = lambda do
        return if @esc_acc.empty? && @esc_lineas.empty?
        n = partes.size + 1
        Sketchup.status_text = "Enviando la construcción a ISgestión: parte #{n}…"
        puts "  Construcción, parte #{n}: #{@esc_tris} triángulos"
        datos = { 'v' => 3, 'u' => 'cm', 'mats' => @esc_acc.values.reject { |g| g['p'].empty? },
                  'lineas' => @esc_lineas.map { |cap, l| { 'e' => cap, 'p' => l } }, 'objetos' => @esc_objs }
        id = format('escena-%03d', n)
        post(h, { t: codigo_conexion, accion: 'escena', modelo_id: inicio['modelo_id'], parte: id, gz: gzip64(JSON.generate(datos)) })
        partes << { 'id' => id, 'tris' => @esc_tris }
        @esc_acc = {}
        @esc_lineas = {}
        @esc_objs = []
        @esc_obj_idx = {}
        @esc_tris = 0
      end
      puts 'Enviar a ISgestión: enviando la construcción (muros, pisos, cielos)…'
      escena(model.entities, Geom::Transformation.new, nil, nil, { 'n' => 'Geometría suelta', 'm' => nil, 'r' => '', 'k' => 'suelta' }, [])
      @esc_enviar.call
      # Texturas de los materiales usados (las que ya están en ISgestión no se repiten)
      texturas = []
      @texturas.each_with_index do |(id, m), k|
        ext = nil
        if ya.include?(id)
          ext = (File.extname(m.texture.filename.to_s).downcase == '.png' ? 'png' : 'jpg')
        else
          Sketchup.status_text = "Enviando texturas a ISgestión: #{k + 1} de #{@texturas.size}"
          img = imagen_textura(m)
          next unless img
          if img[0].bytesize > 8 * 1024 * 1024
            puts "  Textura #{m.display_name} muy pesada (#{img[0].bytesize / 1024 / 1024} MB): se ve solo su color"
            next
          end
          ext = img[1]
          post(h, { t: codigo_conexion, accion: 'textura', modelo_id: inicio['modelo_id'], id: id, ext: ext, nombre: m.display_name, b64: Base64.strict_encode64(img[0]) })
        end
        texturas << { 'id' => id, 'ext' => ext, 'nombre' => m.display_name }
      end
      puts "Enviar a ISgestión: #{texturas.size} texturas" 
      Sketchup.status_text = 'Enviando el inventario a ISgestión…'
      post(h, { t: codigo_conexion, accion: 'inventario', modelo_id: inicio['modelo_id'],
                datos: { 'proyecto' => @codigo, 'nombre' => inicio['proyecto'], 'archivo' => model.path, 'fecha' => fecha, 'items' => lista,
                         'escena' => partes, 'texturas' => texturas } })
      @partes = partes
    end
    Sketchup.status_text = ''
    comps = lista.count { |i| i['tipo'] == 'componente' }
    UI.messagebox("Listo: el modelo quedó en ISgestión, proyecto \"#{inicio['proyecto']}\".\n" \
                  "#{lista.size} tipos de objetos (#{comps} de muebles); 3D: #{@m3d.size} muebles, #{nuevas} enviados ahora#{@cambiadas.to_i.positive? ? " (#{@cambiadas} porque cambiaron o no tenían firma)" : ''}.\n" \
                  "Construcción (muros, pisos, cielos): #{@partes.to_a.sum { |x| x['tris'] }} triángulos en #{@partes.to_a.size} partes.\n\n" \
                  'En ISgestión abre (o actualiza) Proyectos → Modelo SketchUp.')
  rescue StandardError => err
    Sketchup.status_text = ''
    msg = err.message.to_s
    msg = "No se pudo conectar con ISgestión (revisa internet). #{msg}" if err.is_a?(SocketError) || err.is_a?(OpenSSL::SSL::SSLError) || err.is_a?(Net::OpenTimeout)
    puts "Enviar a ISgestión: error #{err.class}: #{msg}"
    UI.messagebox("No se pudo enviar a ISgestión.\n#{msg}")
  end

  unless file_loaded?(__FILE__)
    UI.menu('Extensions').add_item('Enviar a ISgestión') { EnviarAISgestion.enviar }
    file_loaded(__FILE__)
  end
end

EnviarAISgestion.enviar
