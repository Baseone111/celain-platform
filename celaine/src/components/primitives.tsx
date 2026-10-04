import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AudioLines, Music2, X } from 'lucide-react';
import type { Idea, User } from '../types';

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
export function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        background: user.avatar_color,
        width: size,
        height: size,
        fontSize: size > 48 ? 26 : 12,
      }}
    >
      {initials(user.display_name)}
    </span>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal-content ${wide ? 'modal-wide' : ''}`}
          aria-describedby={undefined}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  icon: Icon = Music2,
  title,
  description,
  action,
}: {
  icon?: typeof Music2;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={27} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Cover({
  idea,
  small = false,
  children,
}: {
  idea: Idea;
  small?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`cover cover-${idea.cover_color} ${small ? 'cover-small' : ''}`}>
      <span className="cover-top">
        {small ? (
          ''
        ) : (
          <>
            <span>CELAINE ORIGINAL</span>
            <AudioLines size={19} />
          </>
        )}
      </span>
      <span className="cover-title">{idea.title}</span>
      <div className="cover-bottom">
        <span>{small ? '' : `${idea.idea_type.toUpperCase()} / ${idea.genre.toUpperCase()}`}</span>
        {children}
      </div>
    </div>
  );
}
