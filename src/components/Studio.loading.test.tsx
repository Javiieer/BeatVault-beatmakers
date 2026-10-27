import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Studio } from './Studio';
it('distinguishes loading and a failed catalog read from an empty upload collection and offers a retry', () => {
  const retry = vi.fn(async () => undefined);
  const props = { scope: 'demo', uploads: [], onPlay: vi.fn(), onUpdate: vi.fn(async () => ({})), onReload: retry };
  const { rerender } = render(<Studio {...props} loading />);
  expect(screen.getByText('Cargando tus subidas…')).toBeInTheDocument();
  expect(screen.queryByText('Todavia no tienes subidas')).not.toBeInTheDocument();
  rerender(<Studio {...props} loadError="API offline" />);
  expect(screen.getByRole('heading', { name: 'No se pudieron cargar tus subidas' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Subir mi primer audio' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga de subidas' }));
  expect(retry).toHaveBeenCalledOnce();
});
