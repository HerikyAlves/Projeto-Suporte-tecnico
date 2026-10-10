

const API_BASE_URL = "COLE_AQUI_O_ENDERECO_DA_API";

const form = document.getElementById("ticket-form");
const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const priorityInput = document.getElementById("priority");
const searchInput = document.getElementById("search");
const statusFilter = document.getElementById("status-filter");
const priorityFilter = document.getElementById("priority-filter");
const ticketList = document.getElementById("ticket-list");
const cancelEditButton = document.getElementById("cancel-edit");
const formHeading = document.getElementById("form-heading");
const formHelp = document.getElementById("form-help");
const submitButton = document.getElementById("submit-button");
const newTicketButton = document.getElementById("new-ticket");

const totalElement = document.getElementById("total");
const openElement = document.getElementById("open");
const closedElement = document.getElementById("closed");
const visibleCountElement = document.getElementById("visible-count");

let tickets = [];
let editingId = null;
let requestInProgress = false;

const priorityToApi = {
  "Baixa": "baixa",
  "Média": "media",
  "Alta": "alta"
};

const priorityFromApi = {
  "baixa": "Baixa",
  "media": "Média",
  "alta": "Alta"
};

function normalizeTicket(ticket) {
  return {
    id: String(ticket.id),
    title: ticket.title,
    description: ticket.description || "",
    priority: priorityFromApi[ticket.priority] || "Média",
    status: ticket.status === "concluido"
      ? "Concluído"
      : "Aberto",
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at
  };
}

async function apiRequest(path, options = {}) {
  if (
    !API_BASE_URL ||
    API_BASE_URL === "COLE_AQUI_O_ENDERECO_DA_API"
  ) {
    throw new Error(
      "A API ainda não foi configurada. Precisamos iniciar o backend e inserir o endereço dele."
    );
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    let message = `Erro na API: ${response.status}`;

    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      // Mantém a mensagem padrão.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function showMessage(message) {
  let element = document.getElementById("api-message");

  if (!element) {
    element = document.createElement("p");
    element.id = "api-message";
    element.setAttribute("role", "status");

    const container = document.getElementById("ticket-form");

    if (container) {
      container.insertAdjacentElement("beforebegin", element);
    } else {
      document.body.prepend(element);
    }
  }

  element.textContent = message;
}

function clearMessage() {
  const element = document.getElementById("api-message");

  if (element) {
    element.textContent = "";
  }
}

async function loadTickets() {
  try {
    const data = await apiRequest("/tickets");
    tickets = data.map(normalizeTicket);
    clearMessage();
    renderTickets();
    updateDashboard();
  } catch (error) {
    showMessage(error.message);
    ticketList.innerHTML =
      "<p>Não foi possível carregar os chamados da API.</p>";
    updateDashboard();
  }
}

function getFilteredTickets() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const priority = priorityFilter.value;

  return tickets.filter(ticket => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search) ||
      ticket.description.toLowerCase().includes(search);

    const matchesStatus =
      status === "todos" ||
      (status === "aberto" && ticket.status === "Aberto") ||
      (status === "concluido" && ticket.status === "Concluído");

    const matchesPriority =
      priority === "todas" || ticket.priority === priority;

    return matchesSearch && matchesStatus && matchesPriority;
  });
}

function renderTickets() {
  const filteredTickets = getFilteredTickets();

  ticketList.innerHTML = "";

  if (visibleCountElement) {
    visibleCountElement.textContent = filteredTickets.length;
  }

  if (filteredTickets.length === 0) {
    ticketList.innerHTML = "<p>Nenhum chamado encontrado.</p>";
    return;
  }

  filteredTickets.forEach(ticket => {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const heading = document.createElement("h3");
    heading.textContent = ticket.title;

    const description = document.createElement("p");
    description.textContent =
      ticket.description || "Sem descrição.";

    const metadata = document.createElement("p");
    metadata.textContent =
      `Prioridade: ${ticket.priority} | Status: ${ticket.status}`;

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => startEditing(ticket));

    const statusButton = document.createElement("button");
    statusButton.type = "button";
    statusButton.textContent =
      ticket.status === "Concluído"
        ? "Reabrir"
        : "Concluir";

    statusButton.addEventListener("click", () => {
      changeTicketStatus(ticket);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Excluir";
    deleteButton.addEventListener("click", () => {
      deleteTicket(ticket.id);
    });

    card.append(
      heading,
      description,
      metadata,
      editButton,
      statusButton,
      deleteButton
    );

    ticketList.appendChild(card);
  });
}

function updateDashboard() {
  if (totalElement) {
    totalElement.textContent = tickets.length;
  }

  if (openElement) {
    openElement.textContent = tickets.filter(
      ticket => ticket.status === "Aberto"
    ).length;
  }

  if (closedElement) {
    closedElement.textContent = tickets.filter(
      ticket => ticket.status === "Concluído"
    ).length;
  }

  if (visibleCountElement) {
    visibleCountElement.textContent = getFilteredTickets().length;
  }
}

function startEditing(ticket) {
  editingId = ticket.id;

  titleInput.value = ticket.title;
  descriptionInput.value = ticket.description;
  priorityInput.value = ticket.priority;

  formHeading.textContent = "Editar chamado";
  formHelp.textContent = "Altere os dados e salve as mudanças.";
  submitButton.textContent = "Salvar alterações";
  cancelEditButton.hidden = false;

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function resetForm() {
  editingId = null;
  form.reset();

  formHeading.textContent = "Novo chamado";
  formHelp.textContent = "Preencha os dados para registrar um chamado.";
  submitButton.textContent = "Criar chamado";
  cancelEditButton.hidden = true;
}

async function handleFormSubmit(event) {
  event.preventDefault();

  if (requestInProgress) return;

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const priority = priorityToApi[priorityInput.value];

  if (!title) {
    showMessage("Informe o título do chamado.");
    return;
  }

  if (!priority) {
    showMessage("Selecione uma prioridade válida.");
    return;
  }

  const payload = {
    title,
    description,
    priority
  };

  requestInProgress = true;
  submitButton.disabled = true;
  clearMessage();

  try {
    if (editingId !== null) {
      await apiRequest(`/tickets/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      showMessage("Chamado atualizado com sucesso.");
    } else {
      await apiRequest("/tickets", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMessage("Chamado criado com sucesso.");
    }

    resetForm();
    await loadTickets();
  } catch (error) {
    showMessage(error.message);
  } finally {
    requestInProgress = false;
    submitButton.disabled = false;
  }
}

async function changeTicketStatus(ticket) {
  if (requestInProgress) return;

  const newStatus =
    ticket.status === "Concluído" ? "aberto" : "concluido";

  requestInProgress = true;
  clearMessage();

  try {
    await apiRequest(
      `/tickets/${ticket.id}/status?status=${newStatus}`,
      { method: "PATCH" }
    );

    await loadTickets();
    showMessage("Status atualizado com sucesso.");
  } catch (error) {
    showMessage(error.message);
  } finally {
    requestInProgress = false;
  }
}

async function deleteTicket(id) {
  const confirmed = window.confirm(
    "Tem certeza de que deseja excluir este chamado?"
  );

  if (!confirmed || requestInProgress) return;

  requestInProgress = true;
  clearMessage();

  try {
    await apiRequest(`/tickets/${id}`, {
      method: "DELETE"
    });

    if (editingId === id) {
      resetForm();
    }

    await loadTickets();
    showMessage("Chamado excluído com sucesso.");
  } catch (error) {
    showMessage(error.message);
  } finally {
    requestInProgress = false;
  }
}

form.addEventListener("submit", handleFormSubmit);

cancelEditButton.addEventListener("click", resetForm);

newTicketButton.addEventListener("click", () => {
  resetForm();

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  titleInput.focus();
});

searchInput.addEventListener("input", renderTickets);
statusFilter.addEventListener("change", renderTickets);
priorityFilter.addEventListener("change", renderTickets);

loadTickets();
