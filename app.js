const resolveApiBaseUrl = () => {
  const htmlElement = document.documentElement;
  const overrideBase = htmlElement?.dataset?.apiBaseUrl?.trim();
  if (overrideBase) {
    return overrideBase.replace(/\/+$/, '');
  }

  const { origin, protocol, host } = window.location || {};

  if (origin && origin !== 'null') {
    return `${origin.replace(/\/+$/, '')}/api`;
  }

  if (protocol?.startsWith('file')) {
    return 'http://localhost:5000/api';
  }

  if (host) {
    return `http://${host.replace(/\/+$/, '')}/api`;
  }

  return '/api';
};

const API_BASE_URL = resolveApiBaseUrl();

const sanitizeName = (value = '') => value.replace(/[^A-Za-z\s'-]/g, '');
const sanitizeDigits = (value = '', maxLength = Infinity) =>
  value.replace(/\D/g, '').slice(0, Math.max(0, maxLength));
const navigationKeys = new Set([
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Tab',
  'Enter',
  'Escape'
]);
const isPermittedControlCombo = (event) => event.ctrlKey || event.metaKey || event.altKey;
const enforceNumericKeydown = (event) => {
  if (isPermittedControlCombo(event)) {
    return;
  }

  if (navigationKeys.has(event.key) || event.key === 'Shift') {
    return;
  }

  if (event.key.length === 1 && /\d/.test(event.key)) {
    return;
  }

  event.preventDefault();
};

const isValidIdCard = (value = '') => sanitizeDigits(value, 13).length === 13;

const setCustomValidity = (input, isValid, message) => {
  if (!input) return;
  input.setCustomValidity(isValid ? '' : message);
};

const initInsertForm = () => {
  const form = document.querySelector('#form');
  if (!form) return;

  const firstnameInput = form.querySelector('#firstname');
  const lastnameInput = form.querySelector('#lastname');
  const phoneInput = form.querySelector('#phone');
  const idcardInput = form.querySelector('#idcard');
  const creditcardInput = form.querySelector('#creditcard');
  const statusMessage = form.querySelector('[data-form-status]');
  const submitButton = form.querySelector('button[type="submit"]');

  const setStatus = (message, type = 'info') => {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.dataset.type = type;
    statusMessage.hidden = false;
  };

  const clearStatus = () => {
    if (!statusMessage) return;
    statusMessage.textContent = '';
    statusMessage.hidden = true;
    delete statusMessage.dataset.type;
  };

  firstnameInput?.addEventListener('input', (event) => {
    event.target.value = sanitizeName(event.target.value);
    setCustomValidity(event.target, Boolean(event.target.value.trim()), 'First name is required');
  });

  firstnameInput?.addEventListener('invalid', (event) => {
    setCustomValidity(event.target, Boolean(event.target.value.trim()), 'First name is required');
  });

  lastnameInput?.addEventListener('input', (event) => {
    event.target.value = sanitizeName(event.target.value);
    setCustomValidity(event.target, Boolean(event.target.value.trim()), 'Last name is required');
  });

  lastnameInput?.addEventListener('invalid', (event) => {
    setCustomValidity(event.target, Boolean(event.target.value.trim()), 'Last name is required');
  });

  phoneInput?.addEventListener('input', (event) => {
    event.target.value = sanitizeDigits(event.target.value, 10);
    setCustomValidity(
      event.target,
      /^(0\d{9})$/.test(event.target.value),
      'Phone number must start with 0 and contain 10 digits'
    );
  });

  phoneInput?.addEventListener('invalid', (event) => {
    setCustomValidity(
      event.target,
      /^(0\d{9})$/.test(event.target.value),
      'Phone number must start with 0 and contain 10 digits'
    );
  });

  idcardInput?.addEventListener('input', (event) => {
    event.target.value = sanitizeDigits(event.target.value, 13);
    setCustomValidity(
      event.target,
      isValidIdCard(event.target.value),
      'ID card number must contain exactly 13 digits'
    );
  });

  idcardInput?.addEventListener('invalid', (event) => {
    setCustomValidity(
      event.target,
      isValidIdCard(event.target.value),
      'ID card number must contain exactly 13 digits'
    );
  });

  idcardInput?.addEventListener('keydown', enforceNumericKeydown);

  idcardInput?.addEventListener('paste', (event) => {
    if (!event.clipboardData) return;
    event.preventDefault();

    const pasted = event.clipboardData.getData('text') ?? '';
    const input = event.target;
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;

    const before = input.value.slice(0, selectionStart);
    const after = input.value.slice(selectionEnd);
    const combined = `${before}${pasted}${after}`;

    input.value = sanitizeDigits(combined, 13);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });


  creditcardInput?.addEventListener('input', (event) => {
    const digitsOnly = sanitizeDigits(event.target.value, 16);
    event.target.value = digitsOnly.match(/.{1,4}/g)?.join('-') ?? '';
    setCustomValidity(
      event.target,
      /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(event.target.value),
      'Credit card number must be 16 digits'
    );
  });

  creditcardInput?.addEventListener('invalid', (event) => {
    setCustomValidity(
      event.target,
      /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(event.target.value),
      'Credit card number must be 16 digits'
    );
  });

  form.addEventListener('submit', async (event) => {
    const inputs = [firstnameInput, lastnameInput, phoneInput, idcardInput, creditcardInput].filter(Boolean);

    inputs.forEach((input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    clearStatus();
    submitButton?.setAttribute('disabled', 'true');
    setStatus('Submitting user...', 'info');

    const payload = {
      Firstname: firstnameInput?.value.trim() ?? '',
      Lastname: lastnameInput?.value.trim() ?? '',
      Phone: phoneInput?.value.trim() ?? '',
      Creditcard: creditcardInput?.value.trim() ?? '',
      IDcard: idcardInput?.value.trim() ?? ''
    };

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage =
          errorBody?.errors?.join(', ') ||
          errorBody?.message ||
          `Unable to insert user (status ${response.status})`;
        throw new Error(errorMessage);
      }

      form.reset();
      clearStatus();
      setStatus('User inserted successfully.', 'success');
    } catch (error) {
      console.error('Unable to insert user:', error);
      setStatus(error?.message ?? 'Unable to insert user. Please try again.', 'error');
    } finally {
      submitButton?.removeAttribute('disabled');
    }
  });
};

const initUsersTables = () => {
  const tableConfigs = Array.from(document.querySelectorAll('[data-users-config]'));
  if (!tableConfigs.length) return;

  tableConfigs.forEach((config) => {
    const table = config.querySelector('[data-users-table]');
    const tableBody = table?.querySelector('tbody');
    const statusMessage = config.querySelector('[data-users-status]');
    const refreshButton = config.querySelector('[data-users-refresh]');

    if (!table || !tableBody || !statusMessage) return;

    const columns =
      config.dataset.fields
        ?.split(',')
        .map((field) => field.trim())
        .filter(Boolean) ?? ['id', 'Firstname', 'Lastname', 'Phone', 'IDcard', 'Creditcard'];

    const loadingMessage = config.dataset.loadingText ?? 'Loading users...';
    const emptyMessage = config.dataset.emptyText ?? 'No users found.';
    const errorMessage = config.dataset.errorText ?? 'Unable to load users. Please try again later.';
    const apiPath = config.dataset.apiPath || '/users';
    const dataKey = config.dataset.resultKey || 'result';
    const debug = config.dataset.debug === 'true';
    const authHeaders = (() => {
      const explicitAuth = config.dataset.basicAuth?.trim();
      if (explicitAuth) {
        return {
          Authorization: explicitAuth.toLowerCase().startsWith('basic ')
            ? explicitAuth
            : `Basic ${explicitAuth}`
        };
      }

      const username = config.dataset.authUsername;
      const password = config.dataset.authPassword;

      if (username && password) {
        try {
          const encode =
            typeof btoa === 'function'
              ? btoa
              : typeof window !== 'undefined' && typeof window.btoa === 'function'
                ? window.btoa.bind(window)
                : null;

          if (!encode) {
            throw new Error('Basic auth encoder unavailable');
          }

          const encoded = encode(`${username}:${password}`);
          return { Authorization: `Basic ${encoded}` };
        } catch (error) {
          console.error('Unable to encode basic auth credentials:', error);
        }
      }

      return null;
    })();

    const buildUrl = () => {
      if (/^https?:\/\//i.test(apiPath)) {
        return apiPath;
      }

      const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
      return `${API_BASE_URL}${normalizedPath}`;
    };

    const setStatus = (message, type = 'info') => {
      statusMessage.textContent = message;
      statusMessage.dataset.type = type;
      statusMessage.hidden = false;
    };

    const clearStatus = () => {
      statusMessage.hidden = true;
      delete statusMessage.dataset.type;
    };

    const getValue = (record, fieldPath) => {
      return fieldPath
        .split('.')
        .reduce((value, key) => (value && key in value ? value[key] : undefined), record);
    };

    const renderTableRows = (records) => {
      tableBody.innerHTML = '';

      records.forEach((record) => {
        const row = document.createElement('tr');

        columns.forEach((field) => {
          const cell = document.createElement('td');
          const value = getValue(record, field);
          cell.textContent = value ?? '';
          row.appendChild(cell);
        });

        tableBody.appendChild(row);
      });
    };

    const loadUsers = async () => {
      const url = buildUrl();
      setStatus(debug ? `${loadingMessage} (${url})` : loadingMessage);

      try {
        const headers = { Accept: 'application/json' };
        if (authHeaders) {
          Object.assign(headers, authHeaders);
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const records = Array.isArray(payload[dataKey]) ? payload[dataKey] : [];

        if (!records.length) {
          tableBody.innerHTML = '';
          setStatus(emptyMessage, 'empty');
          return;
        }

        renderTableRows(records);
        clearStatus();
      } catch (error) {
        console.error('Unable to load users:', error);
        tableBody.innerHTML = '';
        const message = debug
          ? `${errorMessage} ${error?.message ?? ''}`.trim()
          : errorMessage;
        setStatus(message, 'error');
      }
    };

    refreshButton?.addEventListener('click', loadUsers);

    loadUsers();
  });
};

document.addEventListener('DOMContentLoaded', () => {
  initInsertForm();
  initUsersTables();
});
