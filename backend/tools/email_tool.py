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

def send_report_email(user_email: str, report_type: str, total_count: int, csv_link: str = "", leads: list = []):
    resend.api_key = get_resend_key()
    
    titles = {
        "consolidados": "Relatório de Consolidação",
        "visitantes": "Relatório de Novos Visitantes"
    }
    
    title = titles.get(report_type.lower(), "Relatório de Dados")
    
    # Build HTML table for leads
    leads_html = ""
    if leads:
        leads_html += """
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; text-align: left;">
            <thead>
                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #ddd;">
                    <th style="padding: 12px 10px; color: #333;">Nome</th>
                    <th style="padding: 12px 10px; color: #333;">Telefone</th>
                    <th style="padding: 12px 10px; color: #333;">Data Criação</th>
                    <th style="padding: 12px 10px; color: #333;">País</th>
                </tr>
            </thead>
            <tbody>
        """
        for i, row in enumerate(leads):
            bg_color = "#ffffff" if i % 2 == 0 else "#f9fafb"
            leads_html += f"""
                <tr style="background-color: {bg_color}; border-bottom: 1px solid #ebebeb;">
                    <td style="padding: 10px; color: #444;">{row.get("Nome", "N/A")}</td>
                    <td style="padding: 10px; color: #444;">{row.get("Telefone", "N/A")}</td>
                    <td style="padding: 10px; color: #444;">{row.get("Criado_Em", "N/A")}</td>
                    <td style="padding: 10px; color: #444;">{row.get("Pais", "N/A")}</td>
                </tr>
            """
        leads_html += """
            </tbody>
        </table>
        """
        if total_count > len(leads):
            leads_html += f"<p style='text-align: center; color: #888; font-size: 13px; margin-top: 15px;'>Exibindo os últimos {len(leads)} de {total_count} leads. Acesse o sistema para visualizar todos.</p>"
    else:
        leads_html = "<p style='color: #666; font-style: italic;'>Nenhum registro retornado para os critérios atuais ou pacote vazio.</p>"
        
    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: auto; padding: 30px; border: 1px solid #eaeaea; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
        <h2 style="color: #1a1a1a; border-bottom: 2px solid #FFD700; padding-bottom: 12px; margin-top: 0;">📊 {title}</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.5;">Aqui está o pacote de dados limpos recém processados do <b>Hub Lagoinha Consolidação</b> (sem histórico de tarefas, focado em contatos).</p>
        
        <div style="background-color: #f8fafc; padding: 15px 20px; border-radius: 8px; border-left: 4px solid #FFD700; margin: 25px 0;">
            <p style="margin: 0; font-size: 16px; color: #222;"><strong>✅ Vidas Listadas Encontradas:</strong> {total_count}</p>
        </div>
        
        <h3 style="color: #111; margin-top: 35px; margin-bottom: 10px; font-size: 18px;">Lista de Contatos Dinâmica</h3>
        {leads_html}
        
        <div style="margin-top: 45px; text-align: center;">
            <a href="https://hub.lagoinha.com" style="background-color: #111; color: #FFD700; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Acessar Dashboard Completo</a>
        </div>
        <div style="margin-top: 35px; padding-top: 25px; border-top: 1px solid #f0f0f0; text-align: center;">
            <p style="font-size: 12px; color: #a1a1aa; margin: 0;">E-mail automático gerado em tempo pelo Motor de Relatórios.</p>
            <p style="font-size: 12px; color: #a1a1aa; margin: 4px 0 0 0;">Lagoinha Orlando Church.</p>
        </div>
    </div>
    """
    
    try:
        response = resend.Emails.send({
            "from": "Equipe Lagoinha <onboarding@resend.dev>",
            "to": user_email,
            "subject": f"{title} - Lagoinha Orlando",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Erro ao enviar relatorio HTML para {user_email}: {e}")
        return {"error": str(e)}
