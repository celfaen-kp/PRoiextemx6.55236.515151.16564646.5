/* Imputar horas partiendo de los partes del día: lo que firmó cada uno en
 * cada obra ya viene puesto, sin pasarse de lo que queda por imputar. */

S.partes = [
  { id: 'p1', obraId: 'o1', fecha: '2026-10-02', estado: 'firmado', horas: { u3: 6, u4: 6 } },
  { id: 'p2', obraId: 'o2', fecha: '2026-10-02', estado: 'firmado', horas: { u3: 2.25 } },
  { id: 'p3', obraId: 'o3', fecha: '2026-10-02', estado: 'anulado', horas: { u3: 8 } },
  { id: 'p4', obraId: 'o1', fecha: '2026-10-01', estado: 'firmado', horas: { u3: 8 } },
];
var l = horasDePartesDia('u3', '2026-10-02');
igual('dos obras ese día (el anulado y el de ayer no cuentan)', l.map((x) => x.obraId + ':' + x.minutos).join(','), 'o1:360,o2:135');
igual('quien no tiene parte: nada', horasDePartesDia('u9', '2026-10-02').length, 0);

var prop = impLineasDesdePartes('u3', '2026-10-02', 540);
igual('con 9 h de presencia: 6 h, 2:15 y el resto a otros', prop.map((x) => x.categoria + ':' + (x.obraId || '-') + ':' + x.minutos).join(','), 'obra:o1:360,obra:o2:135,otros:-:45');
prop = impLineasDesdePartes('u3', '2026-10-02', 420);
igual('con 7 h de presencia se recorta la segunda obra y no sobra nada', prop.map((x) => x.obraId + ':' + x.minutos).join(','), 'o1:360,o2:60');
igual('sin partes: sin propuesta', impLineasDesdePartes('u9', '2026-10-02', 480).length, 0);
igual('las líneas del parte van marcadas', prop[0].deParte, true);

resultado();
