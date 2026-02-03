'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

type GraphNode = {
  id: string;
  label?: string;
};

type GraphEdge = {
  from: string;
  to: string;
  label?: string;
};

type GraphBlockProps = {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
};

export default function GraphBlock({ nodes, edges }: GraphBlockProps) {
  const t = useTranslations();

  const safeNodes = useMemo(() => (Array.isArray(nodes) ? nodes : []), [nodes]);
  const safeEdges = useMemo(() => (Array.isArray(edges) ? edges : []), [edges]);

  const layout = useMemo(() => {
    const radius = 140;
    const centerX = 180;
    const centerY = 120;
    const angleStep = (Math.PI * 2) / Math.max(safeNodes.length, 1);

    const positions = new Map<string, { x: number; y: number }>();
    safeNodes.forEach((node, idx) => {
      const angle = idx * angleStep;
      positions.set(node.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    });

    return positions;
  }, [safeNodes]);

  if (safeNodes.length === 0) {
    return (
      <div className="glass-surface rounded-md p-3 text-sm text-muted">
        {t('ai.blocks.graph')}
      </div>
    );
  }

  return (
    <div className="glass-surface rounded-md p-3 overflow-x-auto text-foreground">
      <svg width={360} height={240} className="min-w-[320px]">
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--muted)" />
          </marker>
        </defs>
        {safeEdges.map((edge, idx) => {
          const from = layout.get(edge.from);
          const to = layout.get(edge.to);
          if (!from || !to) return null;
          return (
            <g key={`edge-${idx}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--muted)"
                strokeWidth="1"
                markerEnd="url(#arrow)"
              />
              {edge.label ? (
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2}
                  fill="var(--muted)"
                  fontSize="10"
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {safeNodes.map((node) => {
          const pos = layout.get(node.id);
          if (!pos) return null;
          return (
            <g key={node.id}>
              <circle cx={pos.x} cy={pos.y} r={18} fill="var(--surface-strong)" stroke="var(--accent)" />
              <text
                x={pos.x}
                y={pos.y + 4}
                fill="var(--foreground)"
                fontSize="10"
                textAnchor="middle"
              >
                {node.label || node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
