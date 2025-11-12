
import React from 'react';
import { CallState } from '../types';

interface StatusIndicatorProps {
  state: CallState;
}

const statusConfig = {
  [CallState.IDLE]: { text: 'Ready to Connect', color: 'bg-gray-400' },
  [CallState.CONNECTING]: { text: 'Connecting...', color: 'bg-yellow-500 animate-pulse' },
  [CallState.ACTIVE]: { text: 'Call Active', color: 'bg-green-500 animate-pulse' },
  [CallState.ENDED]: { text: 'Call Ended', color: 'bg-blue-500' },
  [CallState.ERROR]: { text: 'Error', color: 'bg-red-500' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ state }) => {
  const { text, color } = statusConfig[state];

  return (
    <div className="flex items-center justify-center space-x-2">
      <div className={`w-3 h-3 rounded-full ${color}`}></div>
      <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">{text}</span>
    </div>
  );
};
