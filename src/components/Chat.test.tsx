import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from './Chat';

const mocks = vi.hoisted(() => ({
  readFriendOverview: vi.fn(),
  readChatConversations: vi.fn(),
  readChatPresence: vi.fn(),
  readChatMessages: vi.fn(),
  markChatRead: vi.fn(),
  sendChatMessage: vi.fn(),
}));

vi.mock('../data/friendRepository', () => ({ readFriendOverview: mocks.readFriendOverview }));
vi.mock('../data/chatRepository', () => ({
  markChatRead: mocks.markChatRead,
  readChatConversations: mocks.readChatConversations,
  readChatMessages: mocks.readChatMessages,
  readChatPresence: mocks.readChatPresence,
  sendChatMessage: mocks.sendChatMessage,
}));

const profile = {
  accountId: 'peer-1',
  displayName: 'Producer One',
  bio: '',
  genres: ['Trap'],
  avatarId: 'initials',
  coverId: 'lo-fi',
};

const message = (body: string) => ({
  id: 'message-1',
  senderId: 'me',
  recipientId: 'peer-1',
  body,
  createdAt: '2026-10-15T12:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('EventSource', class {
    onopen: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    close = vi.fn();
  });

  mocks.readFriendOverview.mockResolvedValue({ ok: true, data: { friends: [{ id: 'friendship-1', profile }], incoming: [], outgoing: [] } });
  mocks.readChatConversations.mockResolvedValue({ ok: true, data: [] });
  mocks.readChatPresence.mockResolvedValue({ ok: true, data: { onlineIds: [] } });
  mocks.readChatMessages.mockResolvedValue({ ok: true, data: [] });
  mocks.markChatRead.mockResolvedValue({ ok: true, data: { updated: 0, readAt: '2026-10-15T12:00:00.000Z' } });
  mocks.sendChatMessage.mockResolvedValue({ ok: true, data: message('Hello') });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  vi.unstubAllGlobals();
});

describe('Chat conversation errors', () => {
  it('shows a thread load error inside the selected conversation and retries that thread', async () => {
    mocks.readChatMessages
      .mockResolvedValueOnce({ ok: false, error: { message: 'History unavailable' } })
      .mockResolvedValue({ ok: true, data: [] });

    render(<Chat userId="me" initialPeerId="peer-1" />);

    const thread = document.querySelector('.chat-thread');
    expect(thread).not.toBeNull();
    const alert = await within(thread as HTMLElement).findByRole('alert');
    expect(alert).toHaveTextContent('History unavailable');
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar conversación' }));

    await waitFor(() => expect(mocks.readChatMessages).toHaveBeenCalledTimes(2));
    expect(mocks.markChatRead).toHaveBeenCalledTimes(1);
    expect(mocks.sendChatMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(within(thread as HTMLElement).queryByRole('alert')).not.toBeInTheDocument());
  });

  it('keeps an unconfirmed draft and checks the thread without resending the message', async () => {
    const draft = 'A message the server may already have accepted';
    mocks.readChatMessages
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: [message(draft)] });
    mocks.sendChatMessage.mockResolvedValue({ ok: false, error: { code: 'NETWORK_ERROR', message: 'No se recibió respuesta.' } });

    render(<Chat userId="me" initialPeerId="peer-1" />);

    const input = await screen.findByLabelText('Escribe un mensaje');
    await waitFor(() => expect(mocks.markChatRead).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    const thread = document.querySelector('.chat-thread') as HTMLElement;
    const alert = await within(thread).findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo confirmar el envío');
    expect(input).toHaveValue(draft);
    fireEvent.click(within(alert).getByRole('button', { name: 'Comprobar conversación' }));

    expect(await within(thread).findByText(draft)).toBeInTheDocument();
    await waitFor(() => expect(mocks.readChatMessages).toHaveBeenCalledTimes(2));
    expect(mocks.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue(draft);
    expect(within(thread).queryByRole('alert')).not.toBeInTheDocument();
  });
});
