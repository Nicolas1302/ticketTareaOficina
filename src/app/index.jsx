import 'react-native-url-polyfill/auto';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Modal, TextInput, Alert, RefreshControl, ScrollView, SafeAreaView, StatusBar, Dimensions } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { PieChart, BarChart } from 'react-native-chart-kit';
import DateTimePicker from '@react-native-community/datetimepicker'; // <-- NUEVO CALENDARIO

// ====================================================================
// CONFIGURACIÓN DE SUPABASE
// ====================================================================
const SUPABASE_URL = "https://yccrzesadzovgxuqjevm.supabase.co"; // <- REEMPLAZAR
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljY3J6ZXNhZHpvdmd4dXFqZXZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTk2MTYsImV4cCI6MjEwODA5NTYxNn0.J2M_YdkE0fLraYGAwUFIbOsJhiHZsxUG8ONqE9IAEEY";         // <- REEMPLAZAR

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const screenWidth = Dimensions.get("window").width - 32; 

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(false);
  
  // NUEVO: Estados para Buscador y Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // TODOS, PENDIENTES, RESUELTOS

  // NUEVO: Estado para el Calendario Nativo
  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  const [statsEstados, setStatsEstados] = useState([]);
  const [statsTecnicos, setStatsTecnicos] = useState({ labels: ['Sin datos'], datasets: [{ data: [0] }] });

  const [modalNuevo, setModalNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState({
    dependencia: '', solicitado_por: '', tipo_solicitud: 'SOFTWARE',
    equipo_activo: '', prioridad: 'BAJA', tecnico_asignado: '',
    descripcion_problema: '', fecha_limite: ''
  });

  const [modalResolver, setModalResolver] = useState(false);
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);
  const [solucion, setSolucion] = useState('');

  const procesarGraficos = (data) => {
    const conteoEstados = {};
    const conteoTecnicos = {};

    data.forEach(t => {
      if (t.estado) conteoEstados[t.estado] = (conteoEstados[t.estado] || 0) + 1;
      if (t.tecnico_asignado) conteoTecnicos[t.tecnico_asignado] = (conteoTecnicos[t.tecnico_asignado] || 0) + 1;
    });

    const colores = { 'PENDIENTE': '#f59e0b', 'EN PROCESO': '#3b82f6', 'RESUELTO': '#10b981', 'CERRADO': '#64748b' };
    const dataPie = Object.keys(conteoEstados).map((estado) => ({
      name: estado.substring(0, 3) + '.', 
      cantidad: conteoEstados[estado],
      color: colores[estado] || '#cbd5e1',
      legendFontColor: '#334155',
      legendFontSize: 12
    }));
    setStatsEstados(dataPie);

    const labels = Object.keys(conteoTecnicos).map(t => t.substring(0, 5)); 
    const valores = Object.values(conteoTecnicos);
    
    if (labels.length > 0) {
      setStatsTecnicos({ labels, datasets: [{ data: valores }] });
    } else {
      setStatsTecnicos({ labels: ['N/A'], datasets: [{ data: [0] }] });
    }
  };

  const cargarTickets = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.from('tickets_informatica').select('*').order('fecha_ingreso', { ascending: false });
      if (error) throw error;
      setTickets(data || []);
      procesarGraficos(data || []); 
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarTickets(); }, []);

  const guardarTicket = async () => {
    if (!formNuevo.descripcion_problema || !formNuevo.dependencia) return Alert.alert('Atención', 'Dependencia y Descripción son obligatorias.');
    const ticketAInsertar = { ...formNuevo, origen_carga: 'ANDROID', estado: 'PENDIENTE' };
    if (ticketAInsertar.fecha_limite === '') delete ticketAInsertar.fecha_limite;

    setCargando(true);
    try {
      await supabase.from('tickets_informatica').insert([ticketAInsertar]);
      setModalNuevo(false);
      setFormNuevo({ dependencia: '', solicitado_por: '', tipo_solicitud: 'SOFTWARE', equipo_activo: '', prioridad: 'BAJA', tecnico_asignado: '', descripcion_problema: '', fecha_limite: '' });
      cargarTickets();
    } catch (error) { Alert.alert('Error al guardar'); } finally { setCargando(false); }
  };

  const resolverTicket = async () => {
    if (!ticketSeleccionado) return;
    setCargando(true);
    try {
      await supabase.from('tickets_informatica').update({ estado: 'RESUELTO', fecha_resolucion: new Date().toISOString(), solucion_trabajo_realizado: solucion || 'OK' }).eq('numero_ticket', ticketSeleccionado.numero_ticket);
      setModalResolver(false); setTicketSeleccionado(null); setSolucion('');
      cargarTickets();
    } catch (error) { Alert.alert('Error al resolver'); } finally { setCargando(false); }
  };

  // NUEVO: Lógica para confirmar y eliminar
  const confirmarEliminar = (id) => {
    Alert.alert(
      "Eliminar Ticket",
      `¿Estás seguro de que querés borrar el ticket #${id}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: async () => {
            setCargando(true);
            try {
              await supabase.from('tickets_informatica').delete().eq('numero_ticket', id);
              cargarTickets();
            } catch (error) { Alert.alert('Error', 'No se pudo eliminar'); } finally { setCargando(false); }
        }}
      ]
    );
  };

  // NUEVO: Selector de Fecha
  const alCambiarFecha = (event, fechaSeleccionada) => {
    setMostrarCalendario(false);
    if (fechaSeleccionada) {
      const fechaFormateada = fechaSeleccionada.toISOString().split('T')[0];
      setFormNuevo({ ...formNuevo, fecha_limite: fechaFormateada });
    }
  };

  // NUEVO: Motor de filtrado en tiempo real
  const ticketsFiltrados = tickets.filter(t => {
    // Filtro por texto
    const texto = busqueda.toLowerCase();
    const coincideBusqueda = (t.dependencia || '').toLowerCase().includes(texto) ||
                             (t.descripcion_problema || '').toLowerCase().includes(texto) ||
                             (t.tecnico_asignado || '').toLowerCase().includes(texto);
    
    // Filtro por estado
    let coincideEstado = true;
    if (filtroEstado === 'PENDIENTES') coincideEstado = t.estado === 'PENDIENTE' || t.estado === 'EN PROCESO';
    if (filtroEstado === 'RESUELTOS') coincideEstado = t.estado === 'RESUELTO' || t.estado === 'CERRADO';

    return coincideBusqueda && coincideEstado;
  });

  const renderCabecera = () => (
    <View style={{ marginBottom: 10 }}>
      {tickets.length > 0 && (
        <>
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Estado Global de Trabajos</Text>
            <PieChart data={statsEstados} width={screenWidth} height={140} chartConfig={{ color: () => `black` }} accessor={"cantidad"} backgroundColor={"transparent"} paddingLeft={"10"} absolute />
          </View>
        </>
      )}
      
      {/* SECCIÓN DE BÚSQUEDA Y FILTROS */}
      <View style={styles.panelFiltros}>
        <TextInput 
          style={styles.buscadorInput} 
          placeholder="🔍 Buscar dependencia, técnico o falla..." 
          value={busqueda} 
          onChangeText={setBusqueda} 
        />
        <View style={styles.filaFiltros}>
          <TouchableOpacity style={[styles.btnFiltro, filtroEstado === 'TODOS' && styles.btnFiltroActivo]} onPress={() => setFiltroEstado('TODOS')}>
            <Text style={[styles.txtFiltro, filtroEstado === 'TODOS' && styles.txtFiltroActivo]}>Todos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnFiltro, filtroEstado === 'PENDIENTES' && styles.btnFiltroActivo]} onPress={() => setFiltroEstado('PENDIENTES')}>
            <Text style={[styles.txtFiltro, filtroEstado === 'PENDIENTES' && styles.txtFiltroActivo]}>Pendientes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnFiltro, filtroEstado === 'RESUELTOS' && styles.btnFiltroActivo]} onPress={() => setFiltroEstado('RESUELTOS')}>
            <Text style={[styles.txtFiltro, filtroEstado === 'RESUELTOS' && styles.txtFiltroActivo]}>Resueltos</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderTicket = ({ item }) => {
    const esResuelto = item.estado === 'RESUELTO';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.ticketId}>#{item.numero_ticket}</Text>
            <View style={[styles.badge, { backgroundColor: esResuelto ? '#10b981' : (item.estado === 'EN PROCESO' ? '#3b82f6' : '#f59e0b') }]}>
              <Text style={styles.badgeText}>{item.estado}</Text>
            </View>
          </View>
          {/* NUEVO: Botón de Eliminar */}
          <TouchableOpacity onPress={() => confirmarEliminar(item.numero_ticket)} style={styles.btnEliminar}>
            <Text style={styles.txtEliminar}>🗑️</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardTitle}>{item.dependencia}</Text>
        <Text style={styles.cardDesc}>
          FECHA LIMITE: <Text style={styles.txtFechaRoja}>{item.fecha_limite}</Text>
        </Text>
        <Text style={styles.cardDesc}>{item.descripcion_problema}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.infoText}>🛠️ {item.tecnico_asignado || 'Sin asignar'}</Text>
        </View>
        {!esResuelto && (
          <TouchableOpacity style={styles.btnResolver} onPress={() => { setTicketSeleccionado(item); setModalResolver(true); }}>
            <Text style={styles.btnResolverText}>✓ Marcar Resuelto</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1565c0" />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Oficina Informática</Text>
        </View>
        <TouchableOpacity style={styles.btnNuevo} onPress={() => setModalNuevo(true)}>
          <Text style={styles.btnNuevoText}>+ NUEVO</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={ticketsFiltrados} // <- Pasamos el array ya filtrado
        keyExtractor={(item) => item.numero_ticket.toString()}
        ListHeaderComponent={renderCabecera}
        renderItem={renderTicket}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargarTickets} />}
      />

      {/* Modal Nuevo Ticket */}
      <Modal visible={modalNuevo} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Nuevo Ticket</Text>
              
              <Text style={styles.label}>Dependencia:</Text>
              <TextInput style={styles.input} value={formNuevo.dependencia} onChangeText={(t) => setFormNuevo({ ...formNuevo, dependencia: t.toUpperCase() })} placeholder="Ej: MATERIAL" />

              <Text style={styles.label}>Solicitado por:</Text>
              <TextInput style={styles.input} value={formNuevo.solicitado_por} onChangeText={(t) => setFormNuevo({ ...formNuevo, solicitado_por: t.toUpperCase() })} placeholder="Ej: PEREZ" />

              <Text style={styles.label}>Técnico Asignado:</Text>
              <View style={styles.opcionesContainer}>
                {['AYALA', 'GAYOSO', 'FERNANDEZ'].map(tec => (
                  <TouchableOpacity key={tec} style={[styles.btnOpcion, formNuevo.tecnico_asignado === tec && styles.btnOpcionActivo]} onPress={() => setFormNuevo({...formNuevo, tecnico_asignado: tec})}>
                    <Text style={[styles.txtOpcion, formNuevo.tecnico_asignado === tec && styles.txtOpcionActivo]}>{tec}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Tipo de Solicitud:</Text>
              <View style={styles.opcionesContainer}>
                {['SOFTWARE', 'HARDWARE', 'REDES'].map(tipo => (
                  <TouchableOpacity key={tipo} style={[styles.btnOpcion, formNuevo.tipo_solicitud === tipo && styles.btnOpcionActivo]} onPress={() => setFormNuevo({...formNuevo, tipo_solicitud: tipo})}>
                    <Text style={[styles.txtOpcion, formNuevo.tipo_solicitud === tipo && styles.txtOpcionActivo]}>{tipo}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Prioridad:</Text>
              <View style={styles.opcionesContainer}>
                {['BAJA', 'MEDIA', 'ALTA'].map(prio => (
                  <TouchableOpacity key={prio} style={[styles.btnOpcion, formNuevo.prioridad === prio && styles.btnOpcionActivo]} onPress={() => setFormNuevo({...formNuevo, prioridad: prio})}>
                    <Text style={[styles.txtOpcion, formNuevo.prioridad === prio && styles.txtOpcionActivo]}>{prio}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* NUEVO: Calendario Nativo */}
              <Text style={styles.label}>Fecha Límite (Opcional):</Text>
              <TouchableOpacity onPress={() => setMostrarCalendario(true)} style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: formNuevo.fecha_limite ? '#0f172a' : '#94a3b8' }}>
                  {formNuevo.fecha_limite ? `📅 ${formNuevo.fecha_limite}` : 'Tocar para seleccionar fecha...'}
                </Text>
              </TouchableOpacity>
              
              {mostrarCalendario && (
                <DateTimePicker
                  value={formNuevo.fecha_limite ? new Date(formNuevo.fecha_limite) : new Date()}
                  mode="date"
                  display="default"
                  onChange={alCambiarFecha}
                />
              )}

              <Text style={styles.label}>Descripción del Problema:</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline value={formNuevo.descripcion_problema} onChangeText={(t) => setFormNuevo({ ...formNuevo, descripcion_problema: t.toUpperCase() })} />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#64748b' }]} onPress={() => setModalNuevo(false)}>
                  <Text style={styles.btnModalText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#1565c0' }]} onPress={guardarTicket}>
                  <Text style={styles.btnModalText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Resolver Ticket */}
      <Modal visible={modalResolver} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Finalizar Ticket #{ticketSeleccionado?.numero_ticket}</Text>
            <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]} multiline value={solucion} onChangeText={(t) => setSolucion(t.toUpperCase())} placeholder="Solución implementada..." />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#64748b' }]} onPress={() => setModalResolver(false)}><Text style={styles.btnModalText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#10b981' }]} onPress={resolverTicket}><Text style={styles.btnModalText}>Finalizar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { backgroundColor: '#1565c0', padding: 16, paddingTop: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  btnNuevo: { backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnNuevoText: { color: '#1565c0', fontWeight: 'bold', fontSize: 13 },
  chartContainer: { backgroundColor: 'white', borderRadius: 10, padding: 16, marginBottom: 16, elevation: 2, alignItems: 'center' },
  chartTitle: { fontSize: 15, fontWeight: 'bold', color: '#0f172a', marginBottom: 10, alignSelf: 'flex-start' },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 16, marginBottom: 12, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketId: { fontWeight: 'bold', color: '#1565c0', fontSize: 17 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  btnEliminar: { padding: 5 },
  txtEliminar: { fontSize: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  cardDesc: { color: '#475569', fontWeight: 'bold', fontSize: 14, marginBottom: 12 },
  txtFechaRoja: { color: '#ef4444', fontWeight: 'bold'  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 },
  infoText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  btnResolver: { marginTop: 12, backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnResolverText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: '#1565c0', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#f8fafc', fontSize: 14, color: '#0f172a', minHeight: 40 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24 },
  btnModal: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  btnModalText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  opcionesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  btnOpcion: { borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f8fafc' },
  btnOpcionActivo: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  txtOpcion: { color: '#475569', fontSize: 12, fontWeight: 'bold' },
  txtOpcionActivo: { color: '#ffffff' },
  // NUEVOS ESTILOS PARA BÚSQUEDA Y FILTROS
  panelFiltros: { backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 16, elevation: 2 },
  buscadorInput: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 10, fontSize: 14, color: '#0f172a', marginBottom: 10 },
  filaFiltros: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  btnFiltro: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6, backgroundColor: '#e2e8f0' },
  btnFiltroActivo: { backgroundColor: '#1565c0' },
  txtFiltro: { fontSize: 12, fontWeight: 'bold', color: '#475569' },
  txtFiltroActivo: { color: 'white' }
});