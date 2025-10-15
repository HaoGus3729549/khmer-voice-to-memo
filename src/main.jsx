// ========================================
// Main Application Entry Point
// ========================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import KhmerVoiceApp from './KhmerVoiceApp';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <KhmerVoiceApp />
  </React.StrictMode>
);

