import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { api } from '../../src/api';
beforeEach(() => {
  api.resetDemo();
  location.hash = 'discover';
});
async function start() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Good songs start here.' });
  return userEvent.setup();
}

describe('Celaine songwriter flows', () => {
  it('saves a private draft and keeps it out of discovery', async () => {
    const user = await start();
    await user.click(screen.getAllByRole('button', { name: 'Create an idea' })[0]);
    await user.type(screen.getByLabelText('Idea title'), 'Private test melody');
    await user.type(
      screen.getByLabelText(/Your lyrics & notes/),
      'A first line that belongs in my notebook.',
    );
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { name: 'My studio.' });
    expect(screen.getByRole('button', { name: 'View Private test melody' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    await user.type(screen.getByRole('searchbox'), 'Private test melody');
    await screen.findByRole('heading', { name: 'No ideas found' });
  });
  it('searches and bookmarks an idea in the personal collection', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Save After the rain' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Unsave After the rain' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    await user.click(screen.getByRole('button', { name: 'Saved ideas' }));
    await screen.findByRole('heading', { name: 'Keep the inspiration close.' });
    expect(screen.getByRole('button', { name: 'View After the rain' })).toBeTruthy();
    await user.type(screen.getByRole('searchbox'), 'Velvet');
    expect(screen.queryByRole('button', { name: 'View After the rain' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View Velvet hours' })).toBeTruthy();
  });
  it('requires agreement before a demo purchase and creates a license record', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: '$45' }));
    expect(
      (screen.getByRole('button', { name: 'Complete demo purchase' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Complete demo purchase' }));
    await screen.findByRole('heading', { name: 'A new possibility, all yours.' });
    await user.click(screen.getByRole('button', { name: 'View my licenses' }));
    await screen.findByRole('heading', { name: 'My licenses.' });
    expect(screen.getByRole('heading', { name: 'After the rain' })).toBeTruthy();
    expect((await api.orders()).filter((x) => x.status === 'paid')).toHaveLength(1);
  });
  it('keeps feedback focus during player updates and posts the conversation', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'View After the rain' }));
    await screen.findByText(
      'The phrasing in this hook is beautiful. I can hear the harmonies already.',
    );
    const field = screen.getByLabelText('Your feedback');
    await user.type(field, 'A thoughtful ');
    fireEvent.timeUpdate(document.querySelector('audio')!);
    expect(document.activeElement).toBe(field);
    await user.type(field, 'new comment.');
    await user.click(screen.getByRole('button', { name: 'Post feedback' }));
    await screen.findByText('A thoughtful new comment.');
  });
});
