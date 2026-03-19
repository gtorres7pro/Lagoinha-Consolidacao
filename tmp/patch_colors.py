import os

visitor_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/visitor-form.html'
with open(visitor_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('--card-glass: rgba(255, 255, 255, 0.03);', '--card-glass: rgba(0, 191, 255, 0.05);')
text = text.replace('--card-border: rgba(255, 255, 255, 0.08);', '--card-border: rgba(0, 191, 255, 0.2);')
text = text.replace('--accent-color: #FFD700;', '--accent-color: #00BFFF;')
text = text.replace('--accent-hover: #F2CC00;', '--accent-hover: #009ACD;')
text = text.replace('--bg-color: #0A0A0A;', '--bg-color: #050A10;')

form_content_target = '<div class="form-content">\n            <form id="leadForm" onsubmit="handleFormSubmit(event)">'
form_content_replace = """<div class="form-content">
            <div style="text-align: center; margin-bottom: 25px;">
                <h2 data-i18n="visitor_title" style="margin-top:0; margin-bottom: 5px; font-weight: 700; font-size: 1.8rem; color: var(--accent-color);">Cartão de Visitante</h2>
                <p data-i18n="visitor_subtitle" style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0; line-height: 1.4;">Ficamos felizes em receber você hoje! Preencha seus dados para mantermos contato.</p>
            </div>
            <form id="leadForm" onsubmit="handleFormSubmit(event)">"""
text = text.replace(form_content_target, form_content_replace)

if 'visitor_title: "Cartão de Visitante",' not in text:
    text = text.replace('personal_info: "Informações Pessoais",', 'personal_info: "Informações Pessoais",\n                visitor_title: "Cartão de Visitante",\n                visitor_subtitle: "Ficamos muito felizes em receber você hoje! Preencha seus dados para podermos manter contato.",')
    text = text.replace('personal_info: "Personal Information",', 'personal_info: "Personal Information",\n                visitor_title: "Visitor Card",\n                visitor_subtitle: "We are so glad to have you with us today! Please fill out your details so we can connect.",')
    text = text.replace('personal_info: "Información Personal",', 'personal_info: "Información Personal",\n                visitor_title: "Tarjeta de Visitante",\n                visitor_subtitle: "¡Nos alegra mucho recibirte hoy! Por favor, completa tus datos para seguir en contacto.",')

with open(visitor_path, 'w', encoding='utf-8') as f:
    f.write(text)


consolida_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/consolida-form.html'
with open(consolida_path, 'r', encoding='utf-8') as f:
    text2 = f.read()

form_content_target2 = '<div class="form-content">\n            <form id="leadForm" onsubmit="handleFormSubmit(event)">'
form_content_replace2 = """<div class="form-content">
            <div style="text-align: center; margin-bottom: 25px;">
                <h2 data-i18n="consolida_title" style="margin-top:0; margin-bottom: 5px; font-weight: 700; font-size: 1.8rem; color: var(--accent-color);">Ficha de Consolidação</h2>
                <p data-i18n="consolida_subtitle" style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0; line-height: 1.4;">Registre as decisões de hoje. Nenhuma vida deixada para trás.</p>
            </div>
            <form id="leadForm" onsubmit="handleFormSubmit(event)">"""
text2 = text2.replace(form_content_target2, form_content_replace2)

if 'consolida_title: "Ficha de Consolidação",' not in text2:
    text2 = text2.replace('personal_info: "Informações Pessoais",', 'personal_info: "Informações Pessoais",\n                consolida_title: "Ficha de Consolidação",\n                consolida_subtitle: "Registre as decisões de hoje. Nenhuma vida deixada para trás.",')
    text2 = text2.replace('personal_info: "Personal Information",', 'personal_info: "Personal Information",\n                consolida_title: "Consolidation Form",\n                consolida_subtitle: "Record today\'s decisions. No life left behind.",')
    text2 = text2.replace('personal_info: "Información Personal",', 'personal_info: "Información Personal",\n                consolida_title: "Ficha de Consolidación",\n                consolida_subtitle: "Registra las decisiones de hoy. Ninguna vida dejada atrás.",')

with open(consolida_path, 'w', encoding='utf-8') as f:
    f.write(text2)

print("Headers and Colors injected.")
