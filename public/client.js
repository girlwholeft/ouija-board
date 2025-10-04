// client.js
const socket = io();
const pathParts = window.location.pathname.split('/');
const room = pathParts[pathParts.length-1] || 'default-room';

const CYRILLIC = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й',
  'К','Л','М','Н','О','П','Р','С','Т','У','Ф',
  'Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я'
];

// DOM
const board = document.getElementById('board');
const planchette = document.getElementById('planchette');
const presenceList = document.querySelector('#presence ul');
const messageBox = document.getElementById('messageBox');
const keysContainer = document.getElementById('keys');
const nameInput = document.getElementById('name');
const joinBtn = document.getElementById('joinBtn');
const acquireBtn = document.getElementById('acquire');
const releaseBtn = document.getElementById('release');
const clearBtn = document.getElementById('clearMsg');

// init letters
function buildBoard() {
  board.innerHTML = '';
  // simple grid fill: put Cyrillic letters and a few empty cells
  for (let i = 0; i < 33; i++) {
    const div = document.createElement('div');
    div.className = 'letter';
    div.textContent = CYRILLIC[i] || '';
    board.appendChild(div);
  }
}
buildBoard();

// keyboard
CYRILLIC.forEach(ch => {
  const b = document.createElement('div');
  b.className = 'key'; b.textContent = ch;
  b.onclick = () => {
    appendTyped(ch);
    socket.emit('type', { room, text: ch });
  };
  keysContainer.appendChild(b);
});

// typed buffer
let typed = '';
function appendTyped(s) {
  typed += s;
  messageBox.textContent = typed;
}
function clearTyped() {
  typed = ''; messageBox.textContent = '';
}

clearBtn.onclick = () => {
  clearTyped();
  socket.emit('type', { room, text: '' });
};

// presence
socket.on('presence', ({ players }) => {
  presenceList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name || 'Anon';
    presenceList.appendChild(li);
  });
});

// pointer state
let holding = false;
let localOwner = false;
let planchettePos = { x: 200, y: 100 };

// Send join on button click
joinBtn.onclick = () => {
  const name = nameInput.value || 'Anon';
  socket.emit('join', { room, name });
  joinBtn.disabled = true; nameInput.disabled = true;
};

// acquire/release
acquireBtn.onclick = () => socket.emit('acquirePointer', { room });
releaseBtn.onclick = () => socket.emit('releasePointer', { room });

socket.on('pointerLocked', ({ owner }) => {
  if (owner === socket.id) {
    localOwner = true;
    planchette.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    planchette.style.cursor = 'grabbing';
  } else {
    localOwner = false;
  }
});

socket.on('pointerLockFailed', ({ owner }) => {
  alert('Указатель уже занят другим игроком.');
});

socket.on('pointerReleased', () => {
  localOwner = false;
  planchette.style.boxShadow = '';
  planchette.style.cursor = 'grab';
});

// pointer movement from others
socket.on('pointerMove', ({ id, x, y }) => {
  if (id === socket.id) return; // we already render local moves
  planchette.style.left = `${x}px`;
  planchette.style.top = `${y}px`;
});

// typed broadcast
socket.on('type', ({ id, text, name }) => {
  // append for now
  if (text) {
    appendTyped(text);
  }
});

// drag behaviour for planchette (pointer events)
let dragging = false;
planchette.addEventListener('pointerdown', (ev) => {
  if (!localOwner) {
    // try to acquire automatically
    socket.emit('acquirePointer', { room });
    return;
  }
  dragging = true;
  planchette.setPointerCapture(ev.pointerId);
});
window.addEventListener('pointerup', (ev) => {
  dragging = false;
});
window.addEventListener('pointermove', (ev) => {
  if (!dragging || !localOwner) return;
  // compute board-local coords
  const rect = board.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
  // position planchette relative to board wrapper
  const wrapperRect = board.getBoundingClientRect();
  planchette.style.left = `${wrapperRect.left + x}px`;
  planchette.style.top = `${wrapperRect.top + y}px`;
  // send normalized coordinates relative to board container (use absolute positions for simplicity)
  socket.emit('pointerMove', { room, x: wrapperRect.left + x, y: wrapperRect.top + y });
});
