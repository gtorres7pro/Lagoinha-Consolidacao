// hub-form-builder.js
// Manager for Form Builder native logic
let _fbForms = [];
let _fbCurrentForm = null;
let _fbCurrentFields = [];

function fbEsc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openFormBuilderModal() {
    document.getElementById('modal-form-builder').style.display = 'flex';
    fbLoadForms();
}

async function fbLoadForms() {
    if (!window._currentWsId) return;
    try {
        const { data, error } = await window.supabase
            .from('form_builder_forms')
            .select('*')
            .eq('workspace_id', window._currentWsId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        _fbForms = data || [];
        fbRenderFormsList();
    } catch (err) {
        console.error("fbLoadForms", err);
        document.getElementById('fb-forms-list').innerHTML = `<div style="color:var(--danger)">Erro ao carregar: ${fbEsc(err.message)}</div>`;
    }
}

function fbRenderFormsList() {
    const container = document.getElementById('fb-forms-list');
    if (_fbForms.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);">Nenhum formulário criado.</div>`;
        return;
    }

    let html = `<div style="display:flex;flex-direction:column;gap:8px;">`;
    for (const f of _fbForms) {
        html += `
            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);">
                <div>
                    <div style="font-weight:600;color:#fff;">${fbEsc(f.name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">/${fbEsc(f.slug)} • ${f.is_active ? 'Ativo' : 'Inativo'}</div>
                </div>
                <button class="btn btn-outline" style="padding:6px 12px;font-size:0.75rem;" onclick="fbEditForm('${f.id}')">Editar</button>
            </div>
        `;
    }
    html += `</div>`;
    container.innerHTML = html;
}

function fbCreateNewForm() {
    _fbCurrentForm = null;
    _fbCurrentFields = [];
    document.getElementById('fb-f-name').value = '';
    document.getElementById('fb-f-slug').value = '';
    document.getElementById('fb-f-desc').value = '';
    document.getElementById('fb-editor-title').innerText = 'Novo Formulário';
    fbRenderFields();
    document.getElementById('modal-form-builder-editor').style.display = 'flex';
}

async function fbEditForm(id) {
    const f = _fbForms.find(x => x.id === id);
    if (!f) return;
    _fbCurrentForm = Object.assign({}, f);
    document.getElementById('fb-f-name').value = f.name;
    document.getElementById('fb-f-slug').value = f.slug;
    document.getElementById('fb-f-desc').value = f.description || '';
    document.getElementById('fb-editor-title').innerText = 'Editar Formulário';

    // Load fields
    try {
        const { data, error } = await window.supabase
            .from('form_builder_fields')
            .select('*')
            .eq('form_id', id)
            .order('display_order', { ascending: true });
        if (error) throw error;
        _fbCurrentFields = data || [];
        fbRenderFields();
        document.getElementById('modal-form-builder-editor').style.display = 'flex';
    } catch (err) {
        alert("Erro carregando campos: " + err.message);
    }
}

function fbAddField() {
    _fbCurrentFields.push({
        _tempId: Date.now().toString(),
        field_key: 'novo_campo_' + _fbCurrentFields.length,
        field_type: 'text',
        label: 'Novo Campo',
        placeholder: '',
        required: false,
        options: null,
        display_order: _fbCurrentFields.length
    });
    fbRenderFields();
}

function fbRemoveField(idx) {
    _fbCurrentFields.splice(idx, 1);
    fbRenderFields();
}

function fbRenderFields() {
    const c = document.getElementById('fb-fields-container');
    if (_fbCurrentFields.length === 0) {
        c.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">Nenhum campo.</div>`;
        return;
    }
    let html = '';
    _fbCurrentFields.forEach((field, i) => {
        html += `
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-weight:600;font-size:0.85rem;">Campo #${i+1}</div>
                    <button class="btn" style="background:none;border:none;color:var(--danger);padding:0;cursor:pointer;" onclick="fbRemoveField(${i})">Remover</button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div>
                        <label style="font-size:0.7rem;color:var(--text-muted);">Label</label>
                        <input type="text" class="hub-field-input" value="${field.label || ''}" onchange="_fbCurrentFields[${i}].label=this.value">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;color:var(--text-muted);">Key (ex: age_range)</label>
                        <input type="text" class="hub-field-input" value="${field.field_key || ''}" onchange="_fbCurrentFields[${i}].field_key=this.value">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;color:var(--text-muted);">Tipo</label>
                        <select class="hub-field-input" onchange="_fbCurrentFields[${i}].field_type=this.value;fbRenderFields();">
                            <option value="text" ${field.field_type==='text'?'selected':''}>Texto Curto</option>
                            <option value="textarea" ${field.field_type==='textarea'?'selected':''}>Texto Longo</option>
                            <option value="select" ${field.field_type==='select'?'selected':''}>Lista (Select)</option>
                            <option value="radio" ${field.field_type==='radio'?'selected':''}>Múltipla Escolha (Radio)</option>
                            <option value="checkbox" ${field.field_type==='checkbox'?'selected':''}>Caixa de Seleção (Checkbox)</option>
                            <option value="date" ${field.field_type==='date'?'selected':''}>Data</option>
                        </select>
                    </div>
                    <div style="display:flex;align-items:flex-end;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;">
                            <input type="checkbox" ${field.required ? 'checked' : ''} onchange="_fbCurrentFields[${i}].required=this.checked">
                            Obrigatório
                        </label>
                    </div>
                </div>
                ${['select','radio','checkbox'].includes(field.field_type) ? `
                    <div>
                        <label style="font-size:0.7rem;color:var(--text-muted);">Opções (JSON Array, ex: ["Option 1", "Option 2"])</label>
                        <textarea class="hub-field-input" rows="2" onchange="try{_fbCurrentFields[${i}].options=JSON.parse(this.value)}catch(e){}">${field.options ? JSON.stringify(field.options) : '[]'}</textarea>
                    </div>
                ` : ''}
            </div>
        `;
    });
    c.innerHTML = html;
}

async function fbSaveForm() {
    const btn = document.querySelector('#modal-form-builder-editor .btn-primary');
    btn.innerHTML = 'Salvando...';
    btn.disabled = true;

    try {
        const name = document.getElementById('fb-f-name').value;
        const slug = document.getElementById('fb-f-slug').value;
        const desc = document.getElementById('fb-f-desc').value;

        if(!name || !slug) throw new Error("Nome e Slug são origatórios");

        let formId = _fbCurrentForm ? _fbCurrentForm.id : null;

        // Save Form
        const formData = {
            workspace_id: window._currentWsId,
            name,
            slug,
            description: desc,
            is_active: true
        };

        if (formId) {
            const { error } = await supabase.from('form_builder_forms').update(formData).eq('id', formId);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from('form_builder_forms').insert([formData]).select().single();
            if (error) throw error;
            formId = data.id;
        }

        // Save Fields (Delete old ones and insert new)
        // This is a naive approach, deleting all and inserting fresh:
        if (formId) {
            await supabase.from('form_builder_fields').delete().eq('form_id', formId);

            if (_fbCurrentFields.length > 0) {
                const inserts = _fbCurrentFields.map((f, idx) => ({
                    workspace_id: window._currentWsId,
                    form_id: formId,
                    field_key: f.field_key,
                    field_type: f.field_type,
                    label: f.label,
                    placeholder: f.placeholder,
                    required: !!f.required,
                    options: f.options,
                    display_order: idx
                }));
                const { error: errFields } = await supabase.from('form_builder_fields').insert(inserts);
                if (errFields) throw errFields;
            }
        }

        document.getElementById('modal-form-builder-editor').style.display = 'none';
        fbLoadForms(); // Refresh
        window._showToast("Formulário salvo com sucesso!", "success");

    } catch(err) {
        alert(err.message);
    } finally {
        btn.innerHTML = 'Salvar Formulário';
        btn.disabled = false;
    }
}
