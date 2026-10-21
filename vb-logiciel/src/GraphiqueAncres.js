// Graphique « Mes Ancres de Carrière » (espace client) — fichier séparé pour que la bibliothèque de
// graphiques (recharts) ne soit chargée qu'à l'affichage de ce graphique (2026-10-21).
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function GraphiqueAncres({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
        <PolarGrid stroke="#f3f4f6" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 500 }} />
        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
        <Radar name="Score" dataKey="A" stroke="#7C3AED" strokeWidth={3} fill="#a78bfa" fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
