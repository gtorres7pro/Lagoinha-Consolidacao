import os

html_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/dashboard.html'
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Fix reportError
report_error_old = """            function reportError(msg) {
                if (leadsContainer) {
                    tContainer.innerHTML = `<div style="grid-column:1/-1; color:#FF6B6B; padding:30px; text-align:center; background:rgba(255,107,107,0.1); border-radius:12px;">Erro Técnico Detectado:<br><b>${msg}</b></div>`;
                }
            }"""
report_error_new = """            function reportError(msg) {
                const lc = document.getElementById('leads-container');
                if (lc) {
                    lc.innerHTML = `<div style="grid-column:1/-1; color:#FF6B6B; padding:30px; text-align:center; background:rgba(255,107,107,0.1); border-radius:12px;">Erro Técnico Detectado:<br><b>${msg}</b></div>`;
                }
                const vc = document.getElementById('visitors-container');
                if (vc) {
                    vc.innerHTML = `<div style="grid-column:1/-1; color:#FF6B6B; padding:30px; text-align:center; background:rgba(255,107,107,0.1); border-radius:12px;">Erro Técnico Detectado:<br><b>${msg}</b></div>`;
                }
            }"""
if report_error_old in text:
    text = text.replace(report_error_old, report_error_new)

# Fix fetchLiveLeads
fetch_empty_old = """                    if (!leads || leads.length === 0) {
                        document.getElementById('leads-container').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 50px;">Nenhum lead encontrado ainda. O banco está vazio.</div>';
                        return;
                    }"""

# Wait, the browser agent said "tContainer.innerHTML = '...';" is around line 893 inside fetchLiveLeads?
# Let's check where tContainer might be outside of reportError:
if "tContainer.innerHTML =" in text and report_error_old not in text:
    text = text.replace("tContainer.innerHTML =", "if(typeof tContainer !== 'undefined') tContainer.innerHTML =")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Check applied.")
