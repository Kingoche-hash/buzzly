// Who is waiting to enter a code. It is remembered for this browser tab, so a page refresh does not lose it.
const KEY = 'buzzly-pending';

export const getPending = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};

export const setPending = (pending) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Private windows may refuse storage. The page still works without it.
  }
};

export const clearPending = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
