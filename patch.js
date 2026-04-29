const fs = require('fs');
let html = fs.readFileSync('frontend/dashboard.html', 'utf8');

const injection = `
                /* Fix for full-bleed views to ignore hub-main padding */
                #view-chat-ao-vivo, #view-mila {
                    position: fixed !important;
                    top: 0; bottom: 0; right: 0;
                    left: var(--sidebar-w);
                    z-index: 10;
                    height: auto !important;
                    margin: 0 !important;
                }
                @media (max-width: 1023px) {
                    #view-chat-ao-vivo, #view-mila {
                        left: 0;
                        top: 54px;
                    }
                }
`;

if (!html.includes('Fix for full-bleed views')) {
    html = html.replace('.mila-chat-window::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }', 
    '.mila-chat-window::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }' + injection);
}

fs.writeFileSync('frontend/dashboard.html', html);
console.log('Patched dashboard.html padding fixes');
