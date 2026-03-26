import os
import resend

def get_resend_key():
    return os.environ.get("RESEND_API_KEY", "")

def send_credentials_email(user_email: str, user_name: str, temp_password: str):
    resend.api_key = get_resend_key()
    
    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #333; margin-bottom: 5px;">Bem-vindo à Lagoinha Orlando! 💛</h2>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <p style="font-size: 16px; color: #555;">Olá <b>{user_name}</b>,</p>
            <p style="font-size: 16px; color: #555;">Sua conta no <b>Hub - Lagoinha Consolidação</b> foi criada pela nossa equipe de administração.</p>
            <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; margin: 25px 0;">
                <p style="margin: 0; font-size: 15px; color: #333;"><strong>E-mail: </strong>{user_email}</p>
                <p style="margin: 10px 0 0; font-size: 15px; color: #333;"><strong>Senha Provisória: </strong>{temp_password}</p>
            </div>
            <p style="font-size: 14px; color: #777; margin-top: 30px;">Acesse o painel para começar. Por favor, redefina sua senha no primeiro acesso.</p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #aaa;">
            <p>Equipe de Consolidação - Lagoinha Orlando Church</p>
        </div>
    </div>
    """
    
    try:
        # For testing, resend requires verifying your domain or using onboarding@resend.dev to the registered email address.
        response = resend.Emails.send({
            "from": "Equipe Lagoinha <onboarding@resend.dev>",
            "to": user_email,
            "subject": "Suas credenciais de acesso - Hub Lagoinha",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Erro ao enviar email de credenciais para {user_email}: {e}")
        return {"error": str(e)}

def send_reset_password_email(user_email: str, reset_link: str):
    resend.api_key = get_resend_key()
    
    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h2 style="color: #333;">Redefinição de Senha 🔒</h2>
        <p>Recebemos um pedido para redefinir a senha da sua conta no Hub Lagoinha Consolidação.</p>
        <p>Se foi você, clique no link abaixo para criar uma nova senha:</p>
        <div style="margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #0b0b0b; color: #FFD700; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Redefinir Minha Senha</a>
        </div>
        <p style="font-size: 13px; color: #888;">Se você não solicitou, pode ignorar este email com segurança.</p>
    </div>
    """
    
    try:
        response = resend.Emails.send({
            "from": "Equipe Lagoinha <onboarding@resend.dev>",
            "to": user_email,
            "subject": "Redefina sua senha do Hub Lagoinha",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Erro ao enviar email de reset para {user_email}: {e}")
        return {"error": str(e)}

def send_report_email(user_email: str, report_type: str, total_count: int, csv_link: str = "", leads: list = [], kpis: dict = {}):
    resend.api_key = get_resend_key()
    
    titles = {
        "consolidados": "Relatório de Consolidação",
        "visitantes": "Relatório de Novos Visitantes"
    }
    title = titles.get(report_type.lower(), "Relatório de Dados")
    
    # Montar o bloco de KPIs caso exista
    kpi_html = ""
    if kpis:
        kpi_html = '<div style="display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 30px;">'
        for k, v in kpis.items():
            kpi_html += f"""
            <div style="flex: 1; min-width: 120px; background: #ffffff; padding: 15px; border-radius: 10px; border-left: 4px solid #FFD700; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
                <p style="margin: 0; font-size: 11px; text-transform: uppercase; color: #888; font-weight: bold; letter-spacing: 0.5px;">{k}</p>
                <p style="margin: 5px 0 0; font-size: 24px; color: #111; font-weight: 800;">{v}</p>
            </div>
            """
        kpi_html += '</div>'

    # Build HTML table for leads
    leads_html = ""
    if leads:
        leads_html += """
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <thead>
                <tr style="background-color: #111; color: #FFD700;">
                    <th style="padding: 14px; font-weight: 600;">Nome</th>
                    <th style="padding: 14px; font-weight: 600;">Telefone</th>
                    <th style="padding: 14px; font-weight: 600;">Data Criação</th>
                    <th style="padding: 14px; font-weight: 600;">País</th>
                </tr>
            </thead>
            <tbody>
        """
        for i, row in enumerate(leads):
            bg_color = "#ffffff" if i % 2 == 0 else "#fcfcfc"
            leads_html += f"""
                <tr style="background-color: {bg_color}; border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px 14px; color: #333; font-weight: 500;">{row.get("Nome", "N/A")}</td>
                    <td style="padding: 12px 14px; color: #555;">{row.get("Telefone", "N/A")}</td>
                    <td style="padding: 12px 14px; color: #666;">{row.get("Criado_Em", "N/A")}</td>
                    <td style="padding: 12px 14px; color: #555; text-align: center;"><span style="background: #eee; padding: 3px 8px; border-radius: 12px; font-size: 11px;">{row.get("Pais", "N/A")}</span></td>
                </tr>
            """
        leads_html += """
            </tbody>
        </table>
        """
        if total_count > len(leads):
            leads_html += f"<p style='text-align: center; color: #888; font-size: 12px; margin-top: 15px;'>Listando um excerto de {len(leads)} de {total_count} leads recentes.</p>"
    else:
        leads_html = "<div style='padding: 20px; background: #fdfdfd; border: 1px dashed #ddd; border-radius: 8px; text-align: center;'><p style='color: #666; font-style: italic; margin: 0;'>Nenhum registro para o período atual.</p></div>"
        
    html_content = f"""
    <div style="font-family: 'Helvetica Neue', 'Inter', Arial, sans-serif; background-color: #fafafa; padding: 40px 15px;">
        <div style="max-width: 650px; margin: auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
            
            <!-- HEADER -->
            <div style="text-align: center; margin-bottom: 35px;">
                <div style="background-color: #111; color: #FFD700; width: 48px; height: 48px; line-height: 48px; font-size: 22px; font-weight: bold; border-radius: 50%; margin: 0 auto 15px;">L</div>
                <h1 style="color: #111; font-size: 26px; font-weight: 800; margin: 0;">{title}</h1>
                <p style="color: #777; font-size: 14px; margin-top: 8px; max-width: 80%; margin-left: auto; margin-right: auto;">Resumo consolidado do painel da Lagoinha. Este relatório contém o desempenho atual e os leads captados.</p>
            </div>
            
            <!-- KPI ROW -->
            {kpi_html}

            <!-- MAIN STAT -->
            <div style="background: linear-gradient(135deg, #111111 0%, #2a2a2a 100%); padding: 20px 25px; border-radius: 12px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="margin: 0; font-size: 13px; color: #FFD700; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Total Computado</p>
                    <p style="margin: 5px 0 0; font-size: 32px; color: #ffffff; font-weight: 900;">{total_count} <span style="font-size: 16px; color: #aaa; font-weight: 400;">vidas</span></p>
                </div>
                <div style="background: rgba(255, 215, 0, 0.15); color: #FFD700; border-radius: 50%; padding: 12px;">📊</div>
            </div>
            
            <h3 style="color: #222; font-size: 16px; font-weight: 700; border-left: 4px solid #FFD700; padding-left: 10px; margin-bottom: 20px;">Levantamento Recente</h3>
            
            <!-- DATATABLE -->
            <div style="margin-bottom: 40px;">
                {leads_html}
            </div>
            
            <!-- ACTION -->
            <div style="text-align: center; margin-top: 45px; margin-bottom: 20px;">
                <a href="https://hub.lagoinha.com" style="background-color: #111; color: #FFD700; padding: 16px 36px; text-decoration: none; border-radius: 30px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s;">ACESSAR MESA DE OPERAÇÕES</a>
            </div>
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #f1f5f9; text-align: center;">
                <p style="font-size: 12px; color: #a1a1aa; margin: 0;">Relatório Automático do <b>Sistema A.N.T.</b></p>
                <p style="font-size: 12px; color: #a1a1aa; margin: 5px 0 0 0;">Lagoinha Orlando Church.</p>
            </div>
        </div>
    </div>
    """
    
    try:
        response = resend.Emails.send({
            "from": "Mesa de Operações <onboarding@resend.dev>",
            "to": user_email,
            "subject": f"{title} - Lagoinha Orlando",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Erro ao enviar relatorio HTML para {user_email}: {e}")
        return {"error": str(e)}
