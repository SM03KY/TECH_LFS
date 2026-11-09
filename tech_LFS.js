
        // ACCOUNT CATEGORIES TAILORED FOR ORGANIZATIONS
        const accountCategories = {
            Revenue: ["Membership Dues", "Grants & Sponsorships", "Donations & Contributions", "Event & Ticket Sales", "Service Consulting Revenue"],
            Expense: ["Program Expenses", "Event Expenses", "Research & Lab Supplies", "Salaries & Honorariums", "Office & Admin Expense", "Travel & Transportation", "Utilities & Rent"],
            Asset: ["Cash / Operating Bank", "Grant Dedicated Account", "Accounts Receivable / Pledges", "Equipment & Assets"],
            Liability: ["Accounts Payable", "Accrued Vendor Bills", "Short-term Credit Card"],
            Equity: ["Unrestricted Fund Balance", "Restricted Grant Fund Balance"]
        };

        const defaultFunds = ["General Operations", "Research Grant 2026", "Annual Gala Event", "Community Outreach"];

        const sampleOrgTransactions = [
            { id: "tx-101", date: "2026-11-01", category: "Equity", subCategory: "Unrestricted Fund Balance", fund: "General Operations", description: "Initial Organization Fund Opening Balance", amount: 25000.00, method: "Cash / Bank Transfer" },
            { id: "tx-102", date: "2026-11-02", category: "Revenue", subCategory: "Grants & Sponsorships", fund: "Research Grant 2026", description: "Global Innovation Grant First Tranche", amount: 15000.00, method: "Grant Account" },
            { id: "tx-103", date: "2026-11-04", category: "Revenue", subCategory: "Membership Dues", fund: "General Operations", description: "Q4 Organizational Annual Member Dues", amount: 6200.00, method: "Cash / Bank Transfer" },
            { id: "tx-104", date: "2026-11-05", category: "Expense", subCategory: "Research & Lab Supplies", fund: "Research Grant 2026", description: "Advanced Computing Hardware & Sensors", amount: 3400.00, method: "Grant Account" },
            { id: "tx-105", date: "2026-11-06", category: "Expense", subCategory: "Event Expenses", fund: "Annual Gala Event", description: "Gala Banquet Hall Deposit & Catering", amount: 1850.00, method: "Cash / Bank Transfer" },
            { id: "tx-106", date: "2026-11-07", category: "Expense", subCategory: "Office & Admin Expense", fund: "General Operations", description: "HQ Internet & Stationeries", amount: 215.80, method: "Cash / Bank Transfer" }
        ];

        const ocrPresets = {
            gala: {
                vendor: "Grand Palace Catering",
                date: "2026-11-06",
                amount: 1850.00,
                subCategory: "Event Expenses",
                fund: "Annual Gala Event",
                rawText: "GRAND PALACE CATERING\nDate: 2026-11-06\nBanquet Catering (100 pax) - ₱1,500.00\nAudio/Visual Rental - ₱350.00\nTotal Amount: ₱1,850.00\nPaid in Full",
                imgSrc: "https://placehold.co/500x700/0f172a/3b82f6?text=ANNUAL+GALA+CATERING%0A%0AGrand+Palace%0ADate:+2026-11-06%0ATotal:+₱1,850.00"
            },
            grant: {
                vendor: "TechLab Scientific Ltd",
                date: "2026-11-05",
                amount: 3400.00,
                subCategory: "Research & Lab Supplies",
                fund: "Research Grant 2026",
                rawText: "TECHLAB SCIENTIFIC INVOICE\nDate: 2026-11-05\nInvoice #TL-8841\nHigh-Performance Compute Node - ₱3,400.00\nGrant Code: RES-2026\nPayment Status: Completed",
                imgSrc: "https://placehold.co/500x700/1e1b4b/6366f1?text=GRANT+RESEARCH+INVOICE%0A%0ATechLab+Scientific%0ADate:+2026-11-05%0ATotal:+₱3,400.00"
            },
            office: {
                vendor: "Metro Office & Utilities",
                date: "2026-11-07",
                amount: 215.80,
                subCategory: "Office & Admin Expense",
                fund: "General Operations",
                rawText: "METRO UTILITIES & OFFICE\nDate: 2026-11-07\nFiber Internet Billing - ₱140.00\nPaper & Office Supplies - ₱75.80\nTOTAL: ₱215.80\nPaid via Transfer",
                imgSrc: "https://placehold.co/500x700/14532d/22c55e?text=HQ+OFFICE+RECEIPT%0A%0AMetro+Utilities%0ADate:+2026-11-07%0ATotal:+₱215.80"
            }
        };

        // State variables
        let orgState = {
            name: "Global Tech Foundation",
            fiscalYear: "January 1",
            currency: "PHP",
            funds: [...defaultFunds]
        };

        let ledgerTransactions = [];
        let fundChartInstance = null;
        let categoryChartInstance = null;
        let activeOcrPreset = null;

        const currencySymbols = { PHP: "₱" };

        window.onload = function() {
            // Load Org Config
            const savedOrg = localStorage.getItem('techledger_org_config');
            if (savedOrg) {
                try { orgState = JSON.parse(savedOrg); } catch(e){}
            }
            if (!currencySymbols[orgState.currency]) {
                orgState.currency = 'PHP';
            }

            // Load Transactions
            const savedTx = localStorage.getItem('techledger_org_txs');
            if (savedTx) {
                try { ledgerTransactions = JSON.parse(savedTx); } catch(e){}
            } else {
                ledgerTransactions = [...sampleOrgTransactions];
            }

            document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
            const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            document.querySelectorAll('.currentDateSpan').forEach(el => el.textContent = todayStr);

            applyOrgConfig();
            populateSubCategories();
            populateFundDropdowns();
            renderAll();
        };

        function saveAllState() {
            localStorage.setItem('techledger_org_config', JSON.stringify(orgState));
            localStorage.setItem('techledger_org_txs', JSON.stringify(ledgerTransactions));
            renderAll();
        }

        function renderAll() {
            renderLedgerTable();
            calculateAndRenderFS();
            renderDashboard();
        }

        function applyOrgConfig() {
            document.getElementById('headerCurrencyBadge').textContent = 'PHP (₱)';
            document.querySelectorAll('.currencySymbol').forEach(el => el.textContent = '₱');

            document.getElementById('settingOrgName').value = orgState.name;
            document.getElementById('settingFiscalYear').value = orgState.fiscalYear;

            renderFundsList();
        }

        function saveOrgSettings() {
            orgState.name = document.getElementById('settingOrgName').value || "Organization Ledger";
            orgState.fiscalYear = document.getElementById('settingFiscalYear').value || "January 1";
            orgState.currency = 'PHP';
            applyOrgConfig();
            saveAllState();
        }

        function renderFundsList() {
            const container = document.getElementById('fundsListContainer');
            container.innerHTML = '';
            orgState.funds.forEach((fund, idx) => {
                const item = document.createElement('div');
                item.className = "flex items-center justify-between bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-xs";
                item.innerHTML = `
                    <span class="font-medium text-slate-200">${fund}</span>
                    <button onclick="deleteFund(${idx})" class="text-slate-500 hover:text-rose-400"><i class="fa-solid fa-xmark"></i></button>
                `;
                container.appendChild(item);
            });
            populateFundDropdowns();
        }

        function addFund() {
            const val = document.getElementById('newFundInput').value.trim();
            if(val && !orgState.funds.includes(val)) {
                orgState.funds.push(val);
                document.getElementById('newFundInput').value = '';
                renderFundsList();
                saveAllState();
            }
        }

        function deleteFund(idx) {
            if(orgState.funds.length > 1) {
                orgState.funds.splice(idx, 1);
                renderFundsList();
                saveAllState();
            }
        }

        function populateFundDropdowns() {
            const entryFundSelect = document.getElementById('entryFund');
            const filterFundSelect = document.getElementById('filterFund');
            const ocrFundSelect = document.getElementById('ocrFund');

            const currentFilter = filterFundSelect.value;
            entryFundSelect.innerHTML = '';
            filterFundSelect.innerHTML = '<option value="ALL">All Funds & Projects</option>';
            ocrFundSelect.innerHTML = '';

            orgState.funds.forEach(fund => {
                entryFundSelect.innerHTML += `<option value="${fund}">${fund}</option>`;
                filterFundSelect.innerHTML += `<option value="${fund}">${fund}</option>`;
                ocrFundSelect.innerHTML += `<option value="${fund}">${fund}</option>`;
            });

            if(currentFilter) filterFundSelect.value = currentFilter;
        }

        function populateSubCategories() {
            const cat = document.getElementById('entryCategory').value;
            const subSelect = document.getElementById('entrySubCategory');
            subSelect.innerHTML = '';
            const list = accountCategories[cat] || [];
            list.forEach(sub => {
                subSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
            });
        }

        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.getElementById(tabId).classList.remove('hidden');

            document.querySelectorAll('.nav-tab').forEach(btn => {
                btn.classList.remove('border-blue-500', 'text-blue-400');
                btn.classList.add('border-transparent', 'text-slate-400');
            });

            const activeBtn = document.getElementById(`btn-${tabId}`);
            if(activeBtn) {
                activeBtn.classList.remove('border-transparent', 'text-slate-400');
                activeBtn.classList.add('border-blue-500', 'text-blue-400');
            }

            if(tabId === 'dashTab') {
                setTimeout(renderDashboardCharts, 100);
            }
        }

        function switchFsSubTab(subId) {
            document.querySelectorAll('.fs-view').forEach(el => el.classList.add('hidden'));
            document.getElementById(`fsView-${subId}`).classList.remove('hidden');

            document.querySelectorAll('.fs-subtab').forEach(btn => {
                btn.classList.remove('border-blue-500', 'text-blue-400');
                btn.classList.add('border-transparent', 'text-slate-400');
            });

            const activeBtn = document.getElementById(`fssub-${subId}`);
            if(activeBtn) {
                activeBtn.classList.remove('border-transparent', 'text-slate-400');
                activeBtn.classList.add('border-blue-500', 'text-blue-400');
            }
        }

        function handleJournalSubmit(e) {
            e.preventDefault();
            const editId = document.getElementById('editEntryId').value;
            const entry = {
                id: editId || 'tx-' + Date.now(),
                date: document.getElementById('entryDate').value,
                category: document.getElementById('entryCategory').value,
                subCategory: document.getElementById('entrySubCategory').value,
                fund: document.getElementById('entryFund').value,
                description: document.getElementById('entryDescription').value,
                amount: parseFloat(document.getElementById('entryAmount').value) || 0,
                method: document.getElementById('entryMethod').value
            };

            if (editId) {
                const idx = ledgerTransactions.findIndex(t => t.id === editId);
                if(idx !== -1) ledgerTransactions[idx] = entry;
            } else {
                ledgerTransactions.unshift(entry);
            }

            cancelEditEntry();
            saveAllState();
        }

        function editEntry(id) {
            const tx = ledgerTransactions.find(t => t.id === id);
            if(!tx) return;

            document.getElementById('editEntryId').value = tx.id;
            document.getElementById('entryDate').value = tx.date;
            document.getElementById('entryCategory').value = tx.category;
            populateSubCategories();
            document.getElementById('entrySubCategory').value = tx.subCategory;
            document.getElementById('entryFund').value = tx.fund;
            document.getElementById('entryDescription').value = tx.description;
            document.getElementById('entryAmount').value = tx.amount;
            document.getElementById('entryMethod').value = tx.method;

            document.getElementById('saveEntryBtn').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Update Entry`;
            document.getElementById('cancelEditBtn').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function cancelEditEntry() {
            document.getElementById('editEntryId').value = '';
            document.getElementById('ledgerForm').reset();
            document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
            populateSubCategories();
            document.getElementById('saveEntryBtn').innerHTML = `<i class="fa-solid fa-plus"></i> Add Journal Entry`;
            document.getElementById('cancelEditBtn').classList.add('hidden');
        }

        function deleteEntry(id) {
            ledgerTransactions = ledgerTransactions.filter(t => t.id !== id);
            saveAllState();
        }

        function resetDemoData() {
            ledgerTransactions = [...sampleOrgTransactions];
            orgState.funds = [...defaultFunds];
            saveAllState();
        }

        // RENDER LEDGER TABLE
        function renderLedgerTable() {
            const tbody = document.getElementById('ledgerTableBody');
            const search = document.getElementById('ledgerSearch').value.toLowerCase();
            const fundFilter = document.getElementById('filterFund').value;

            tbody.innerHTML = '';

            const filtered = ledgerTransactions.filter(t => {
                const matchSearch = t.description.toLowerCase().includes(search) || t.subCategory.toLowerCase().includes(search);
                const matchFund = (fundFilter === 'ALL') || (t.fund === fundFilter);
                return matchSearch && matchFund;
            });

            if(filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500 text-xs">No organizational entries found matching your criteria.</td></tr>`;
                return;
            }

            const sym = currencySymbols[orgState.currency] || '$';

            filtered.forEach(tx => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/40 transition border-b border-slate-800/60";

                let catBadge = 'bg-slate-800 text-slate-300';
                if(tx.category === 'Revenue') catBadge = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                if(tx.category === 'Expense') catBadge = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                if(tx.category === 'Asset') catBadge = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';

                tr.innerHTML = `
                    <td class="py-3 px-4 font-mono text-xs text-slate-400">${tx.date}</td>
                    <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[11px] font-semibold ${catBadge}">${tx.category}</span></td>
                    <td class="py-3 px-4 font-medium text-slate-200">${tx.subCategory}</td>
                    <td class="py-3 px-4 text-xs text-slate-400"><span class="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-300">${tx.fund}</span></td>
                    <td class="py-3 px-4 text-slate-300 max-w-xs truncate">${tx.description}</td>
                    <td class="py-3 px-4 text-right font-mono font-bold ${tx.category === 'Revenue' ? 'text-emerald-400' : 'text-slate-200'}">
                        ${tx.category === 'Revenue' ? '+' : ''}${sym}${tx.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </td>
                    <td class="py-3 px-4 text-center">
                        <div class="flex items-center justify-center space-x-2">
                            <button onclick="editEntry('${tx.id}')" class="text-slate-400 hover:text-blue-400 text-xs"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteEntry('${tx.id}')" class="text-slate-400 hover:text-rose-400 text-xs"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // FINANCIAL STATEMENTS CALCULATOR
        function calculateAndRenderFS() {
            const sym = currencySymbols[orgState.currency] || '$';
            const subCategorySums = {};
            let totalRevenue = 0, totalExpense = 0;
            let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
            let liquidCash = 0;

            ledgerTransactions.forEach(t => {
                const amt = t.amount;
                subCategorySums[t.subCategory] = (subCategorySums[t.subCategory] || 0) + amt;

                if (t.category === 'Revenue') totalRevenue += amt;
                if (t.category === 'Expense') totalExpense += amt;

                if (t.category === 'Asset') {
                    totalAssets += amt;
                    if(t.subCategory.includes('Cash') || t.subCategory.includes('Account')) liquidCash += amt;
                }
                if (t.category === 'Liability') totalLiabilities += amt;
                if (t.category === 'Equity') totalEquity += amt;

                if (t.method.includes('Cash') || t.method.includes('Grant')) {
                    if (t.category === 'Revenue') liquidCash += amt;
                    if (t.category === 'Expense') liquidCash -= amt;
                }
            });

            const netSurplus = totalRevenue - totalExpense;

            // Render Statement of Activities
            const fsRevRows = document.getElementById('fsRevRows');
            const fsExpRows = document.getElementById('fsExpRows');
            fsRevRows.innerHTML = '';
            fsExpRows.innerHTML = '';

            accountCategories.Revenue.forEach(sub => {
                const val = subCategorySums[sub] || 0;
                if(val > 0) {
                    fsRevRows.innerHTML += `<div class="flex justify-between py-1.5 text-slate-300"><span>${sub}</span><span class="font-mono">${sym}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`;
                }
            });

            accountCategories.Expense.forEach(sub => {
                const val = subCategorySums[sub] || 0;
                if(val > 0) {
                    fsExpRows.innerHTML += `<div class="flex justify-between py-1.5 text-slate-300"><span>${sub}</span><span class="font-mono text-rose-400">${sym}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`;
                }
            });

            document.getElementById('fsTotalRev').textContent = `${sym}${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('fsTotalExp').textContent = `${sym}${totalExpense.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('fsNetSurplus').textContent = `${sym}${netSurplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

            // Render Balance Sheet
            const fsAssetRows = document.getElementById('fsAssetRows');
            const fsLiabRows = document.getElementById('fsLiabRows');
            const fsEquityRows = document.getElementById('fsEquityRows');

            fsAssetRows.innerHTML = `<div class="flex justify-between py-1.5 text-slate-200 font-medium"><span>Liquid Cash & Bank Reserves</span><span class="font-mono">${sym}${liquidCash.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`;
            
            accountCategories.Asset.forEach(sub => {
                if(sub.includes('Cash')) return;
                const val = subCategorySums[sub] || 0;
                if(val > 0) fsAssetRows.innerHTML += `<div class="flex justify-between py-1.5 text-slate-300"><span>${sub}</span><span class="font-mono">${sym}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`;
            });

            fsLiabRows.innerHTML = '';
            accountCategories.Liability.forEach(sub => {
                const val = subCategorySums[sub] || 0;
                if(val > 0) fsLiabRows.innerHTML += `<div class="flex justify-between py-1.5 text-slate-300"><span>${sub}</span><span class="font-mono">${sym}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`;
            });
            if(!fsLiabRows.innerHTML) fsLiabRows.innerHTML = `<div class="text-xs text-slate-500 italic py-1">No outstanding liabilities</div>`;

            fsEquityRows.innerHTML = '';
            accountCategories.Equity.forEach(sub => {
                const val = subCategorySums[sub] || 0;
                if(val > 0) fsEquityRows.innerHTML += `<div class="flex justify-between py-1.5 text-slate-300"><span>${sub}</span><span class="font-mono">${sym}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`;
            });

            const totalEquitiesCombined = totalEquity + netSurplus;
            const totalAssetsCombined = liquidCash + (totalAssets - (subCategorySums['Cash / Operating Bank'] || 0));
            const totalLiabEquitiesCombined = totalLiabilities + totalEquitiesCombined;

            document.getElementById('fsTotalAssets').textContent = `${sym}${totalAssetsCombined.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('fsTotalLiab').textContent = `${sym}${totalLiabilities.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('fsAccumSurplus').textContent = `${sym}${netSurplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('fsTotalEquity').textContent = `${sym}${totalEquitiesCombined.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('fsTotalLiabEquity').textContent = `${sym}${totalLiabEquitiesCombined.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

            // Render Cash Flow
            document.getElementById('cfOpRows').innerHTML = `
                <div class="flex justify-between py-1 text-slate-300"><span>Cash Inflows (Revenues & Dues)</span><span class="font-mono text-emerald-400">${sym}${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>
                <div class="flex justify-between py-1 text-slate-300"><span>Cash Outflows (Program & Ops Expenses)</span><span class="font-mono text-rose-400">(${sym}${totalExpense.toLocaleString('en-US', {minimumFractionDigits: 2})})</span></div>
            `;
            document.getElementById('cfTotalOp').textContent = `${sym}${netSurplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('cfNetCashChange').textContent = `${sym}${netSurplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('cfEndingCash').textContent = `${sym}${liquidCash.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

            // Header Sync
            document.getElementById('headerTotalRevenue').textContent = `${sym}${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('headerNetSurplus').textContent = `${sym}${netSurplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        // RENDER DASHBOARD KPI & CHARTS
        function renderDashboard() {
            const sym = currencySymbols[orgState.currency] || '$';
            let rev = 0, exp = 0;
            ledgerTransactions.forEach(t => {
                if(t.category === 'Revenue') rev += t.amount;
                if(t.category === 'Expense') exp += t.amount;
            });
            const surplus = rev - exp;
            const margin = rev > 0 ? ((surplus / rev) * 100).toFixed(1) : 0;

            document.getElementById('dashRevenue').textContent = `${sym}${rev.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('dashExpense').textContent = `${sym}${exp.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('dashNetSurplus').textContent = `${sym}${surplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            document.getElementById('dashNetMargin').textContent = `${margin}% Operating Margin`;
            document.getElementById('dashCashOnHand').textContent = `${sym}${surplus.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        function renderDashboardCharts() {
            const fundData = {};
            orgState.funds.forEach(f => fundData[f] = { rev: 0, exp: 0 });

            ledgerTransactions.forEach(t => {
                if(!fundData[t.fund]) fundData[t.fund] = { rev: 0, exp: 0 };
                if(t.category === 'Revenue') fundData[t.fund].rev += t.amount;
                if(t.category === 'Expense') fundData[t.fund].exp += t.amount;
            });

            const fundCtx = document.getElementById('fundAllocationChart').getContext('2d');
            if(fundChartInstance) fundChartInstance.destroy();

            fundChartInstance = new Chart(fundCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(fundData),
                    datasets: [
                        { label: 'Revenues', data: Object.values(fundData).map(d => d.rev), backgroundColor: '#10b981' },
                        { label: 'Expenses', data: Object.values(fundData).map(d => d.exp), backgroundColor: '#f43f5e' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8' } } },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                        y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
                    }
                }
            });

            const expSubtotals = {};
            ledgerTransactions.filter(t => t.category === 'Expense').forEach(t => {
                expSubtotals[t.subCategory] = (expSubtotals[t.subCategory] || 0) + t.amount;
            });

            const catCtx = document.getElementById('categoryDistChart').getContext('2d');
            if(categoryChartInstance) categoryChartInstance.destroy();

            categoryChartInstance = new Chart(catCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(expSubtotals),
                    datasets: [{
                        data: Object.values(expSubtotals),
                        backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
                }
            });
        }

        // PHOTO-TO-TEXT SCANNER SIMULATION
        function loadOcrPreset(key) {
            const preset = ocrPresets[key];
            if(!preset) return;
            activeOcrPreset = preset;

            document.getElementById('ocrUploadPrompt').classList.add('hidden');
            document.getElementById('ocrPreviewContainer').classList.remove('hidden');
            document.getElementById('ocrImgPreview').src = preset.imgSrc;

            document.getElementById('ocrVendor').value = '';
            document.getElementById('ocrDate').value = '';
            document.getElementById('ocrAmount').value = '';
            document.getElementById('ocrRawText').value = '';

            document.getElementById('ocrStatusBadge').textContent = 'Image Ready for Scan';
            document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400';

            document.getElementById('ocrScanBtn').disabled = false;
            document.getElementById('ocrPostBtn').disabled = true;
            document.getElementById('ocrBoxOverlays').innerHTML = '';
        }

        function handleImageFile(e) {
            const input = e.target;
            const file = input.files[0];
            if(!file) return;
            input.value = '';

            const reader = new FileReader();
            reader.onload = function(evt) {
                if(typeof evt.target.result !== 'string') {
                    document.getElementById('ocrStatusBadge').textContent = 'Could not load image';
                    document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                    return;
                }

                activeOcrPreset = {
                    vendor: "Uploaded Vendor Receipt",
                    date: new Date().toISOString().split('T')[0],
                    amount: 320.00,
                    subCategory: "Office & Admin Expense",
                    fund: orgState.funds[0] || "General Operations",
                    rawText: `CUSTOM OCR SCAN\nDate: ${new Date().toISOString().split('T')[0]}\n1x Vendor Supplies - $320.00\nTotal: $320.00`,
                    imgSrc: evt.target.result
                };

                document.getElementById('ocrUploadPrompt').classList.add('hidden');
                document.getElementById('ocrPreviewContainer').classList.remove('hidden');
                document.getElementById('ocrImgPreview').src = evt.target.result;
                document.getElementById('ocrStatusBadge').textContent = 'Image Ready for Scan';
                document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400';
                document.getElementById('ocrBoxOverlays').innerHTML = '';

                document.getElementById('ocrScanBtn').disabled = false;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.onerror = function() {
                document.getElementById('ocrStatusBadge').textContent = 'Could not load image';
                document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                document.getElementById('ocrScanBtn').disabled = true;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.readAsDataURL(file);
        }

        function runOcrScan() {
            if(!activeOcrPreset) return;

            const scanLaser = document.getElementById('scanLaser');
            const badge = document.getElementById('ocrStatusBadge');
            const overlays = document.getElementById('ocrBoxOverlays');

            scanLaser.classList.remove('hidden');
            badge.textContent = 'Parsing Tokens & Extracting Text...';
            badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 animate-pulse';

            overlays.innerHTML = `
                <div class="ocr-box" style="top: 18%; left: 15%; width: 70%; height: 14%;"></div>
                <div class="ocr-box" style="top: 38%; left: 20%; width: 60%; height: 28%;"></div>
                <div class="ocr-box" style="top: 72%; left: 30%; width: 40%; height: 12%;"></div>
            `;

            setTimeout(() => {
                scanLaser.classList.add('hidden');
                badge.textContent = 'Scan Complete (100% Accuracy)';
                badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400';

                document.getElementById('ocrVendor').value = activeOcrPreset.vendor;
                document.getElementById('ocrDate').value = activeOcrPreset.date;
                document.getElementById('ocrAmount').value = activeOcrPreset.amount;
                document.getElementById('ocrSubCat').value = activeOcrPreset.subCategory;
                document.getElementById('ocrFund').value = activeOcrPreset.fund;
                document.getElementById('ocrRawText').value = activeOcrPreset.rawText;

                document.getElementById('ocrPostBtn').disabled = false;
            }, 2000);
        }

        function postOcrToLedger() {
            if(!activeOcrPreset) return;

            const vendor = document.getElementById('ocrVendor').value || activeOcrPreset.vendor;
            const date = document.getElementById('ocrDate').value || activeOcrPreset.date;
            const amount = parseFloat(document.getElementById('ocrAmount').value) || activeOcrPreset.amount;
            const subCategory = document.getElementById('ocrSubCat').value;
            const fund = document.getElementById('ocrFund').value;

            switchTab('ledgerTab');

            document.getElementById('entryDate').value = date;
            document.getElementById('entryCategory').value = 'Expense';
            populateSubCategories();
            document.getElementById('entrySubCategory').value = subCategory;
            document.getElementById('entryFund').value = fund;
            document.getElementById('entryDescription').value = vendor;
            document.getElementById('entryAmount').value = amount;
            document.getElementById('entryMethod').value = "Cash / Bank Transfer";

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // EXPORT CSV
        function exportCSV() {
            if(ledgerTransactions.length === 0) return;
            let csv = "ID,Date,Category,SubCategory,Fund,Description,Method,Amount\n";
            ledgerTransactions.forEach(t => {
                csv += `"${t.id}","${t.date}","${t.category}","${t.subCategory}","${t.fund}","${t.description.replace(/"/g, '""')}","${t.method}",${t.amount}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `${orgState.name.replace(/\s+/g, '_')}_Ledger.csv`);
            a.click();
        }
    
