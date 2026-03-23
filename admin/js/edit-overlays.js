/**
 * Edit overlays — attach "Edit" buttons to editable regions, show inline/modal editor.
 */

/**
 * Attach an Edit overlay to an element.
 * @param {Object} options
 * @param {HTMLElement} options.element - The element to make editable
 * @param {string} options.key - Content block key (e.g. 'hero_badge', 'season_tag')
 * @param {Function} options.saveFn - Async function to save (returns or throws)
 * @param {Function} options.getValue - () => current value from element
 * @param {'text'|'richtext'} [options.contentType='text'] - Single-line or multi-line
 * @param {Function} [options.onSaved] - Callback after successful save (key, value) => void
 */
export function attachEditOverlay({ element, key, saveFn, getValue, contentType = 'text', onSaved }) {
  if (!element) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'admin-edit-overlay';
  wrapper.style.position = 'relative';

  const parent = element.parentNode;
  if (parent && parent !== document.body) {
    parent.insertBefore(wrapper, element);
    wrapper.appendChild(element);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-edit-btn';
  btn.textContent = 'Edit';
  wrapper.appendChild(btn);

  const msgDiv = document.createElement('div');
  msgDiv.className = 'admin-edit-msg';
  msgDiv.style.display = 'none';
  wrapper.appendChild(msgDiv);

  function showMsg(text, type) {
    msgDiv.textContent = text;
    msgDiv.className = 'admin-edit-msg ' + (type || '');
    msgDiv.style.display = 'block';
    setTimeout(() => { msgDiv.style.display = 'none'; }, 3000);
  }

  function showEditor() {
    const value = typeof getValue === 'function' ? getValue() : (element.textContent || element.innerText || '');
    if (contentType === 'richtext' || (contentType === 'text' && String(value).includes('\n'))) {
      showModal(value);
    } else {
      showInline(value);
    }
  }

  function showInline(currentVal) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentVal;
    input.style.cssText = 'width:100%;padding:0.5rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;border-radius:4px;margin-bottom:0.5rem;';
    const origDisplay = element.style.display;
    element.style.display = 'none';

    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex;gap:0.5rem;align-items:center;';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.className = 'btn-primary';
    saveBtn.style.cssText = 'padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;font-weight:600;';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.style.cssText = 'padding:0.4rem 0.8rem;background:transparent;color:#b0aca8;border:1px solid #444;border-radius:4px;cursor:pointer;';

    const cleanup = () => {
      input.remove();
      actionsRow.remove();
      element.style.display = origDisplay;
      btn.style.display = '';
    };

    btn.style.display = 'none';

    const save = async () => {
      const val = contentType === 'richtext' ? input.value : input.value.trim();
      try {
        await saveFn(val);
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.value = val;
        else if (contentType === 'richtext') element.innerHTML = escapeHtml(val).replace(/\n/g, '<br>');
        else element.textContent = val;
        showMsg('Saved.', 'success');
        if (typeof onSaved === 'function') onSaved(key, val);
        cleanup();
      } catch (err) {
        showMsg(err.message || 'Save failed.', 'error');
      }
    };

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cleanup);
    actionsRow.appendChild(saveBtn);
    actionsRow.appendChild(cancelBtn);

    wrapper.insertBefore(input, element);
    wrapper.insertBefore(actionsRow, element);
    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
    });
  }

  function showModal(currentVal) {
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-modal-backdrop';
    const rows = contentType === 'richtext' ? 6 : 4;
    backdrop.innerHTML = `
      <div class="admin-modal">
        <h4>Edit ${key.replace(/_/g, ' ')}</h4>
        <textarea id="admin-edit-ta" rows="${rows}">${escapeHtml(String(currentVal || ''))}</textarea>
        <div class="admin-edit-msg" id="admin-modal-msg" style="display:none;margin-top:0.5rem;"></div>
        <div class="admin-modal-actions">
          <button type="button" class="btn-primary" id="admin-modal-save">Save</button>
          <button type="button" class="btn-secondary" id="admin-modal-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const ta = backdrop.querySelector('#admin-edit-ta');
    const msgEl = backdrop.querySelector('#admin-modal-msg');

    const close = () => backdrop.remove();

    const save = async () => {
      const val = contentType === 'richtext' ? ta.value : ta.value.trim();
      try {
        await saveFn(val);
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.value = val;
        else if (contentType === 'richtext') element.innerHTML = escapeHtml(val).replace(/\n/g, '<br>');
        else element.textContent = val;
        showMsg('Saved.', 'success');
        if (typeof onSaved === 'function') onSaved(key, val);
        close();
      } catch (err) {
        msgEl.textContent = err.message || 'Save failed.';
        msgEl.className = 'admin-edit-msg error';
        msgEl.style.display = 'block';
      }
    };

    backdrop.querySelector('#admin-modal-save').addEventListener('click', save);
    backdrop.querySelector('#admin-modal-cancel').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  }

  btn.addEventListener('click', showEditor);
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}
