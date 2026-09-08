import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MemoMemoShell from './MemoMemoShell.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoMemoShell />
  </StrictMode>,
);
