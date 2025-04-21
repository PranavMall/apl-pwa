"use client";

import React from 'react';

const Sparkline = ({ data, width = 80, height = 20, color = '#FF6A00' }) => {
  // Early return if no data or only one data point
  if (!data || data.length <= 1) {
    return <span>No data</span>;
  }
  
  // Find min and max values for scaling
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1; // Avoid division by zero
  
  // Calculate dimensions
  const pointWidth = width / (data.length - 1);
  
  // Generate path
  const points = data.map((value, index) => {
    const x = index * pointWidth;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  
  const path = `M${points.join(' L')}`;
  
  return (
    <svg width={width} height={height} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Add a dot for the last point */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="2"
        fill={color}
      />
    </svg>
  );
};

export default Sparkline;
