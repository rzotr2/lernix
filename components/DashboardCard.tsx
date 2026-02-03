'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface DashboardCardProps {
  title: string;
  value?: string;
  icon: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const DashboardCard = ({
  title,
  value,
  icon,
  children,
  className
}: DashboardCardProps) => {
  return (
    <motion.div
      className={`glass-surface-strong rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/50 transition-colors duration-300 ${className}`}
      whileHover={{ y: -5 }}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted">{title}</h3>
          <div className="text-neon-violet">{icon}</div>
        </div>
        {value && (
          <p className="text-3xl font-bold text-foreground">{value}</p>
        )}
      </div>
      {children}
    </motion.div>
  );
};