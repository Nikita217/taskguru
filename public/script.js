
let currentTab = 'all';
let tasks = [];

function openProfile() {
  Telegram.WebApp.showAlert("Профиль в разработке");
}

function openStepModal() {
  document.getElementById('step-modal').classList.remove('hidden');
  document.querySelector('.step-desc').classList.remove('hidden');
  document.querySelector('.step-date').classList.add('hidden');
  document.querySelector('.step-time').classList.add('hidden');
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function nextStep() {
  if (!document.querySelector('.step-date').classList.contains('hidden')) {
    document.querySelector('.step-date').classList.add('hidden');
    document.querySelector('.step-time').classList.remove('hidden');
  } else {
    document.querySelector('.step-desc').classList.add('hidden');
    document.querySelector('.step-date').classList.remove('hidden');
  }
}

function submitTask() {
  const desc = document.getElementById('new-desc').value.trim();
  const date = document.getElementById('new-date').value;
  const time = document.getElementById('new-time').value;
  if (!desc || !date || !time) return Telegram.WebApp.showAlert("Заполни все поля");
  const due = `${date}T${time}`;
  const id = Date.now().toString();
  const userId = Telegram.WebApp.initDataUnsafe.user?.id || "demo";

  fetch('/api/add-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, userId, description: desc, due })
  }).then(res => {
    if (!res.ok) throw new Error('Ошибка при сохранении');
    location.reload();
  }).catch(err => {
    console.error("Ошибка при добавлении:", err);
    Telegram.WebApp.showAlert("Не удалось сохранить задачу");
  });
}

function renderTasks() {
  const container = document.getElementById('task-list');
  container.innerHTML = '';
  const now = new Date().toISOString().split('T')[0];

  tasks.forEach(task => {
    const taskDate = task.due?.split('T')[0];
    const show =
      (currentTab === 'all' && task.status !== 'Done') ||
      (currentTab === 'today' && taskDate === now && task.status !== 'Done') ||
      (currentTab === 'done' && task.status === 'Done');

    if (show) {
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <input type="checkbox" ${task.status === 'Done' ? 'checked' : ''} onchange="completeTask('${task.id}')"/>
        <div class="desc" onclick="editTask('${task.id}')">
          <strong>${task.description}</strong><br>
          <small>${formatDateTime(task.due)}</small>
        </div>
      `;
      container.appendChild(card);
    }
  });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function completeTask(id) {
  fetch('/api/complete-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then(() => location.reload());
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-desc').value = task.description;
  document.getElementById('edit-date').value = task.due.split('T')[0];
  document.getElementById('edit-time').value = task.due.split('T')[1].slice(0,5);
  document.getElementById('edit-modal').classList.remove('hidden');
}

function updateTask() {
  const id = document.getElementById('edit-id').value;
  const desc = document.getElementById('edit-desc').value;
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value;
  const due = `${date}T${time}`;
  fetch('/api/update-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, description: desc, due })
  }).then(() => location.reload());
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    renderTasks();
  });
});

  const tgUser = Telegram.WebApp.initDataUnsafe.user;
  if (tgUser?.photo_url) {
    document.getElementById('user-avatar').src = tgUser.photo_url;
  }
};
