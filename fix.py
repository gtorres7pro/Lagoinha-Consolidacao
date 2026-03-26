import codecs
import re

file_path = "/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/consolida-form.html"
with codecs.open(file_path, 'r', 'utf8') as f:
    txt = f.read()

# 1. Overlay
new_overlay = """<div class="success-overlay" id="successScreen">
                <h3 data-i18n="success_title" style="color: var(--accent); font-size: 2rem;">Obrigado!</h3>
                <p data-i18n="success_sub">Seus dados foram enviados com sucesso.</p>
                <div style="margin-top: 24px;">
                    <button type="button" class="btn-submit" onclick="window.location.reload()" style="padding: 12px 24px; font-size: 0.9rem; font-weight:800; border-radius:100px;">Preencher Nova Ficha</button>
                    <a href="https://www.lagoinhaorlandochurch.com" style="display:block; margin-top:20px; color:var(--text-muted); font-size:0.85rem; text-decoration:none;">Ou ir para a página inicial</a>
                </div>
            </div>"""
txt = re.sub(r'<div class="success-overlay" id="successScreen">.*?</div>', new_overlay, txt, flags=re.DOTALL)

# 2. Country Additions
txt = txt.replace(
    '<option value="BR" data-i18n="country_br">Brasil</option>',
    '<option value="BR" data-i18n="country_br">Brasil</option>\n                    <option value="PT" data-i18n="country_pt">Portugal</option>\n                    <option value="CA" data-i18n="country_ca">Canadá</option>'
)

# 3. New state dropdowns
if "state-pt" not in txt:
    new_states = """<!-- Portugal States -->
                        <select id="state-pt" style="display: none;">
                            <option value="" disabled selected data-i18n="state_select">Selecione o Distrito...</option>
                            <option value="Açores">Açores</option><option value="Aveiro">Aveiro</option><option value="Beja">Beja</option><option value="Braga">Braga</option><option value="Bragança">Bragança</option><option value="Castelo Branco">Castelo Branco</option><option value="Coimbra">Coimbra</option><option value="Évora">Évora</option><option value="Faro">Faro</option><option value="Guarda">Guarda</option><option value="Leiria">Leiria</option><option value="Lisboa">Lisboa</option><option value="Madeira">Madeira</option><option value="Portalegre">Portalegre</option><option value="Porto">Porto</option><option value="Santarém">Santarém</option><option value="Setúbal">Setúbal</option><option value="Viana do Castelo">Viana do Castelo</option><option value="Vila Real">Vila Real</option><option value="Viseu">Viseu</option>
                        </select>
                        <!-- Canada States -->
                        <select id="state-ca" style="display: none;">
                            <option value="" disabled selected data-i18n="state_select">Selecione a Província...</option>
                            <option value="AB">Alberta</option><option value="BC">British Columbia</option><option value="MB">Manitoba</option><option value="NB">New Brunswick</option><option value="NL">Newfoundland and Labrador</option><option value="NS">Nova Scotia</option><option value="NT">Northwest Territories</option><option value="NU">Nunavut</option><option value="ON">Ontario</option><option value="PE">Prince Edward Island</option><option value="QC">Quebec</option><option value="SK">Saskatchewan</option><option value="YT">Yukon</option>
                        </select>
                        <!-- Other State Text Input -->"""
    txt = txt.replace("<!-- Other State Text Input -->", new_states)

# 4. Handle Country logic
regex_country = r'function handleCountryChange\(\) \{[\s\S]*?\}(?=\s*// Apply on Start)'
new_country_logic = """function handleCountryChange() {
            try {
                const country = document.getElementById('country').value;
                const stateText = document.getElementById('state-text');
                const stateUS = document.getElementById('state-us');
                const stateBR = document.getElementById('state-br');
                const statePT = document.getElementById('state-pt');
                const stateCA = document.getElementById('state-ca');

                // Hide all
                [stateText, stateUS, stateBR, statePT, stateCA].forEach(el => {
                    if(el) { el.style.display = 'none'; el.required = false; el.value = ""; }
                });

                if (country === 'US') { stateUS.style.display = 'block'; stateUS.required = true; }
                else if (country === 'BR') { stateBR.style.display = 'block'; stateBR.required = true; }
                else if (country === 'PT') { statePT.style.display = 'block'; statePT.required = true; }
                else if (country === 'CA') { stateCA.style.display = 'block'; stateCA.required = true; }
                else { stateText.style.display = 'block'; stateText.required = true; }
            } catch (e) { console.error("Country Logic Warning: ", e); }
        }\n"""
txt = re.sub(regex_country, new_country_logic, txt, flags=re.DOTALL)

# 5. Translations
regex_trans = r'const translations = \{\s*decision_info[\s\S]*?success_title: "Obrigado!",\s*success_sub: "Seus dados foram enviados com sucesso.",\s*redirecting: "Redirecionando em"\s*\},'
new_trans = """const translations = {
            pt: {
                decision_info: "Decisão Espiritual",
                decision: "Qual a sua decisão hoje? *",
                decision_select: "Selecione a decisão...",
                dec_first: "Aceitei Jesus pela primeira vez",
                dec_return: "Eu voltei para Jesus",
                dec_member: "Quero ser membro",
                service: "Qual culto você está participando? *",
                service_select: "Selecione o Culto...",
                church_name: "Lagoinha Orlando",
                personal_info: "Informações Pessoais",
                consolida_title: "Ficha de Consolidação",
                consolida_subtitle: "Registre as decisões de hoje. Nenhuma vida deixada para trás.",
                first_name: "Primeiro Nome *",
                last_name: "Sobrenome *",
                age: "Idade *",
                gender: "Sexo *",
                gender_select: "Selecione...",
                gender_m: "Masculino",
                gender_f: "Feminino",
                marital: "Estado Civil *",
                marital_select: "Selecione...",
                single: "Solteiro(a)",
                married: "Casado(a)",
                divorced: "Divorciado(a)",
                widowed: "Viúvo(a)",
                contact_info: "Contato e Residência",
                phone: "Telefone (WhatsApp) *",
                email: "E-mail *",
                address: "Endereço (Rua, Número) *",
                zip: "CEP / Zip Code *",
                apt: "Apto / Casa / Compl. (Opcional)",
                country: "País de Residência *",
                country_select: "Selecione o País...",
                country_us: "Estados Unidos (USA)",
                country_br: "Brasil",
                country_pt: "Portugal",
                country_ca: "Canadá",
                state: "Estado / Província / Distrito *",
                state_select: "Selecione a região...",
                state_text_ph: "Digite sua Região",
                city: "Cidade *",
                additional_info: "Informação Adicional",
                baptized: "Você é Batizado? *",
                bap_catholic: "Católico",
                bap_christian: "Evangélico",
                bap_want: "Quero me Batizar",
                bap_no: "Não",
                gc: "Você participa de um GC (Small Group)? *",
                gc_yes: "Sim",
                gc_want: "Quero participar",
                gc_no: "Não",
                submit: "Enviar Formulário",
                success_title: "Obrigado!",
                success_sub: "Seus dados foram enviados com sucesso.",
                redirecting: "Redirecionando..."
            },"""
txt = re.sub(regex_trans, new_trans, txt, flags=re.DOTALL)

txt = txt.replace('country_br: "Brazil",', 'country_br: "Brazil",\n                country_pt: "Portugal",\n                country_ca: "Canada",')
txt = txt.replace('country_br: "Brasil",', 'country_br: "Brasil",\n                country_pt: "Portugal",\n                country_ca: "Canadá",')

# 6. Apply on start DDI detect
regex_dom = r"window\.addEventListener\('DOMContentLoaded', \(\) => \{[\s\S]*?\}\);"
new_dom = """window.addEventListener('DOMContentLoaded', () => {
            handleCountryChange(); 
            changeLanguage();
            
            // Get slug for initial country detection (extract from paths like /braga/consolida-form.html)
            const parts = window.location.pathname.split('/').filter(Boolean);
            const sys = ['login.html', 'dashboard.html', 'consolida-form.html', 'crie-inscricao.html'];
            const slug = parts.find(p => !sys.includes(p))?.toLowerCase() || '';
            
            let initialCountry = "us"; // USA default
            if (['braga', 'almada', 'lisboa', 'porto', 'coimbra', 'algarve'].includes(slug)) initialCountry = "pt";
            else if (['rio-de-janeiro', 'brasil', 'niteroi', 'saopaulo', 'sp', 'rj'].includes(slug)) initialCountry = "br";
            else if (['canada', 'toronto', 'vancouver'].includes(slug)) initialCountry = "ca";

            // International Phone Setup (Waits for DOM to load to prevent CSS clashing)
            window.phoneInput = window.intlTelInput(document.querySelector("#phone"), {
                initialCountry: initialCountry,
                preferredCountries: ["us", "br", "pt", "ca"],
                separateDialCode: true,
                utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/18.2.1/js/utils.js",
            });
        });"""
txt = re.sub(regex_dom, new_dom, txt, flags=re.DOTALL)

# 7. Add country states to submit payload
regex_final = r'let finalState = "";[\s\S]*?const leadData = \{'
new_final = """let finalState = "";
                const country = document.getElementById('country').value;
                if(country === 'US') finalState = document.getElementById('state-us').value;
                else if (country === 'BR') finalState = document.getElementById('state-br').value;
                else if (country === 'PT') finalState = document.getElementById('state-pt').value;
                else if (country === 'CA') finalState = document.getElementById('state-ca').value;
                else finalState = document.getElementById('state-text').value;

                // Format Full Address string
                const addressStr = `${document.getElementById('address').value}, ${document.getElementById('apt').value || ''} - ${document.getElementById('city').value}, ${finalState} - ${country} (${document.getElementById('zip').value})`;

                const leadData = {"""
txt = re.sub(regex_final, new_final, txt, flags=re.DOTALL)

# 8. Success handling block
regex_succ = r"document\.getElementById\('successScreen'\)\.classList\.add\('active'\);[\s\S]*?btn\.disabled = false;"
new_succ = """document.getElementById('successScreen').classList.add('active');
                
                // Show personalized name message
                const firstName = document.getElementById('firstName').value.trim();
                const titleEl = document.querySelector('#successScreen h3');
                if (titleEl && firstName) titleEl.innerText = `Obrigado, ${firstName}!`;
                
                // Clear the form fields silently after message shows up
                setTimeout(() => document.getElementById('visitorForm').reset(), 800);
                
                btn.innerHTML = originalText;
                btn.disabled = false;"""
txt = re.sub(regex_succ, new_succ, txt, flags=re.DOTALL)

with codecs.open(file_path, 'w', 'utf8') as f:
    f.write(txt)
print("done")
