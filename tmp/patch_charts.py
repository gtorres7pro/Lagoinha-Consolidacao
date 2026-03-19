import os

html_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/dashboard.html'
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Add init sequence for visitor charts
init_charts_target = """                ['Culto', 'Pais', 'Decisao', 'GC'].forEach(type => {"""
init_charts_replace = """                ['EstadoCivil', 'Idade'].forEach(type => {
                    const canvasEl = document.getElementById('vChart'+type);
                    if(canvasEl) {
                        chartInstances['v'+type] = new Chart(canvasEl.getContext('2d'), {
                            type: 'pie',
                            data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: 'transparent' }] },
                            options: commonOpts
                        });
                    }
                });

                ['Culto', 'Pais', 'Decisao', 'GC'].forEach(type => {"""
text = text.replace(init_charts_target, init_charts_replace)


update_charts_target = """            function updateCharts(leadsArray) {
                if(Object.keys(chartInstances).length === 0) return;"""

update_charts_replace = """            window.updateVisitorCharts = function(visitorsArray) {
                if(Object.keys(chartInstances).length === 0) return;
                
                const getFrequencies = arr => {
                    const counts = {};
                    arr.forEach(val => { const str = (val || 'Não Informado'); counts[str] = (counts[str] || 0) + 1; });
                    return Object.entries(counts).sort((a,b) => b[1] - a[1]); // Descending
                };
                
                const civil = getFrequencies(visitorsArray.map(l => String(l.estado_civil)));
                
                // Group Idade
                const idades = {'18 a 25': 0, '26 a 35': 0, '36 a 45': 0, 'Acima de 45': 0, 'Não Informado': 0};
                visitorsArray.forEach(l => {
                    let v = parseInt(String(l.idade).replace(/\\D/g, ''));
                    if (isNaN(v)) { idades['Não Informado']++; return; }
                    if (v < 26) idades['18 a 25']++;
                    else if (v <= 35) idades['26 a 35']++;
                    else if (v <= 45) idades['36 a 45']++;
                    else idades['Acima de 45']++;
                });
                const idadeFreq = Object.entries(idades).filter(x => x[1] > 0).sort((a,b) => b[1] - a[1]);

                const colorPalette = ['#FFD700', '#FF6B6B', '#32CD32', '#00BFFF', '#BA55D3', '#FFA500', '#FF8C00', '#FFFFFF'];

                function setChartData(instance, dataObj) {
                    if(!instance) return;
                    instance.data.labels = dataObj.map(d => d[0]);
                    instance.data.datasets[0].data = dataObj.map(d => d[1]);
                    instance.data.datasets[0].backgroundColor = dataObj.map((_, i) => colorPalette[i % colorPalette.length]);
                    instance.update();
                }

                setChartData(chartInstances['vEstadoCivil'], civil);
                setChartData(chartInstances['vIdade'], idadeFreq);
            };

            function updateCharts(leadsArray) {
                if(Object.keys(chartInstances).length === 0) return;"""
text = text.replace(update_charts_target, update_charts_replace)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Patch charts applied.")
