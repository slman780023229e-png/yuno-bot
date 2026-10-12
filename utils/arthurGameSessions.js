// Shared in-memory game routing. Does not alter bank data or bot handlers.
const sessions = new Map();

function getChatSessions(chat) {
  if (!sessions.has(chat)) sessions.set(chat, new Map());
  return sessions.get(chat);
}

export function registerActiveGame(chat, token, type) {
  if (!chat || !token || !type) return false;
  getChatSessions(chat).set(token, type);
  return true;
}

export function unregisterActiveGame(chat, token) {
  const items = sessions.get(chat);
  if (!items) return false;
  const removed = items.delete(token);
  if (!items.size) sessions.delete(chat);
  return removed;
}

export function hasActiveGameType(chat, type) {
  const items = sessions.get(chat);
  if (!items) return false;
  for (const value of items.values()) {
    if (value === type) return true;
  }
  return false;
}

export function listActiveGameTypes(chat) {
  const items = sessions.get(chat);
  return items ? [...new Set(items.values())] : [];
}
