
        // State variables
        let orgState = {
            name: "Global Tech Foundation",
            fiscalYear: "January 1",
            currency: "PHP"
        };

        let ledgerTransactions = [];
        let currentUser = null;
        let csrfToken = "";
        let incomeExpenseChartInstance = null;
        let categoryChartInstance = null;
        let pendingOcrAttachment = null;

        const currencySymbols = { PHP: "₱" };

        function setPasswordVisibility(input, button, visible) {
            input.type = visible ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(visible));
            button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
            button.innerHTML = `<i class="fa-regular ${visible ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
        }

        function initializePasswordToggles() {
            document.querySelectorAll('.password-toggle').forEach(button => {
                button.addEventListener('click', () => {
                    const input = button.parentElement.querySelector('input');
                    setPasswordVisibility(input, button, input.type !== 'text');
                });
            });
            document.querySelectorAll('form').forEach(form => {
                form.addEventListener('reset', () => {
                    form.querySelectorAll('.password-toggle').forEach(button => {
                        setPasswordVisibility(button.parentElement.querySelector('input'), button, false);
                    });
                });
            });
        }

        window.onload = async function() {
            initializeTheme();
            initializePasswordToggles();
            document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
            const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            document.querySelectorAll('.currentDateSpan').forEach(el => el.textContent = todayStr);
            try {
                const result = await apiRequest('bootstrap');
                if (result.authenticated) continueAuthentication(result);
                else showAuthForm(result.setupRequired ? 'setup' : 'login');
            } catch (error) {
                showAuthForm('login', error.message);
            }
        };

        async function apiRequest(action, options = {}) {
            const headers = { 'Content-Type': 'application/json' };
            if (csrfToken && options.method && options.method !== 'GET') {
                headers['X-CSRF-Token'] = csrfToken;
            }
            const query = new URLSearchParams({ action });
            Object.entries(options.params || {}).forEach(([key, value]) => query.set(key, value));
            const response = await fetch(`api.php?${query}`, {
                method: options.method || 'GET',
                headers,
                credentials: 'same-origin',
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
            return result;
        }

        function showAuthForm(mode, message = '') {
            document.getElementById('authGate').classList.remove('hidden');
            document.getElementById('application').classList.add('hidden');
            document.getElementById('setupForm').classList.toggle('hidden', mode !== 'setup');
            document.getElementById('loginForm').classList.toggle('hidden', mode !== 'login');
            document.getElementById('passwordChangeForm').classList.toggle('hidden', mode !== 'passwordChange');
            const messageElement = document.getElementById('authMessage');
            messageElement.textContent = message;
            messageElement.classList.toggle('hidden', !message);
        }

        function initializeApplication(data) {
            currentUser = data.user;
            csrfToken = data.csrfToken;
            orgState = data.org;
            ledgerTransactions = data.transactions;
            document.getElementById('authGate').classList.add('hidden');
            document.getElementById('application').classList.remove('hidden');
            document.getElementById('sessionUser').textContent = `${currentUser.name} · ${currentUser.role}`;
            applyRolePermissions();
            applyOrgConfig();
            renderAll();
            renderDashboardCharts();
            switchTab('dashTab');
        }

        function continueAuthentication(data) {
            currentUser = data.user;
            csrfToken = data.csrfToken;
            if (data.needsPasswordChange) {
                showAuthForm('passwordChange');
                return;
            }
            initializeApplication(data);
        }

        async function login(event) {
            event.preventDefault();
            try {
                const result = await apiRequest('login', {
                    method: 'POST',
                    body: {
                        username: document.getElementById('loginUsername').value,
                        password: document.getElementById('loginPassword').value
                    }
                });
                document.getElementById('loginForm').reset();
                continueAuthentication(result);
            } catch (error) {
                showAuthForm('login', error.message);
            }
        }

        async function setupAdmin(event) {
            event.preventDefault();
            try {
                const result = await apiRequest('setup', {
                    method: 'POST',
                    body: {
                        name: document.getElementById('setupName').value,
                        username: document.getElementById('setupUsername').value,
                        password: document.getElementById('setupPassword').value
                    }
                });
                document.getElementById('setupForm').reset();
                continueAuthentication(result);
            } catch (error) {
                showAuthForm('setup', error.message);
            }
        }

        async function changePassword(event) {
            event.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            if (newPassword !== document.getElementById('confirmPassword').value) {
                showAuthForm('passwordChange', 'The new passwords do not match.');
                return;
            }
            try {
                const result = await apiRequest('change_password', {
                    method: 'POST',
                    body: {
                        currentPassword: document.getElementById('currentPassword').value,
                        newPassword
                    }
                });
                document.getElementById('passwordChangeForm').reset();
                continueAuthentication(result);
            } catch (error) {
                showAuthForm('passwordChange', error.message);
            }
        }

        async function logout() {
            try {
                await apiRequest('logout', { method: 'POST', body: {} });
                currentUser = null;
                csrfToken = '';
                ledgerTransactions = [];
                showAuthForm('login');
            } catch (error) {
                notifyUser(error.message);
            }
        }

        function applyRolePermissions() {
            document.querySelectorAll('[data-role]').forEach(element => {
                const allowedRoles = element.dataset.role.split(' ');
                element.classList.toggle('hidden', !allowedRoles.includes(currentUser.role));
            });
        }

        function notifyUser(message) {
            let notice = document.getElementById('appNotice');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'appNotice';
                notice.setAttribute('role', 'status');
                notice.className = 'fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-rose-500/30 bg-slate-900 px-4 py-3 text-sm text-rose-300 shadow-lg';
                document.body.appendChild(notice);
            }
            notice.textContent = message;
            notice.classList.remove('hidden');
            window.setTimeout(() => notice.classList.add('hidden'), 5000);
        }

        function initializeTheme() {
            const savedTheme = localStorage.getItem('techpass_theme');
            applyTheme(savedTheme === 'light' ? 'light' : 'dark');
        }

        function toggleTheme() {
            const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
            localStorage.setItem('techpass_theme', nextTheme);
            applyTheme(nextTheme);
        }

        function applyTheme(theme) {
            const isLight = theme === 'light';
            document.body.dataset.theme = isLight ? 'light' : 'dark';

            const toggle = document.getElementById('themeToggle');
            toggle.setAttribute('aria-pressed', String(isLight));
            toggle.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light'} mode`);
            toggle.title = `Switch to ${isLight ? 'dark' : 'light'} mode`;
            document.getElementById('themeToggleLabel').textContent = isLight ? 'Dark' : 'Light';
            document.getElementById('themeToggleIcon').className = `fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}`;

            if (window.Chart && !document.getElementById('dashTab').classList.contains('hidden')) {
                renderDashboardCharts();
            }
        }

        function renderAll() {
            renderLedgerTable();
            calculateAndRenderFS();
            renderDashboard();
            if (window.Chart && !document.getElementById('dashTab').classList.contains('hidden')) {
                renderDashboardCharts();
            }
        }

        function applyOrgConfig() {
            document.getElementById('headerCurrencyBadge').textContent = 'PHP (₱)';
            document.querySelectorAll('.currencySymbol').forEach(el => el.textContent = '₱');

            document.getElementById('settingOrgName').value = orgState.name;
            document.getElementById('settingFiscalYear').value = orgState.fiscalYear;
        }

        async function saveOrgSettings() {
            try {
                const result = await apiRequest('settings', {
                    method: 'POST',
                    body: {
                        name: document.getElementById('settingOrgName').value,
                        fiscalYear: document.getElementById('settingFiscalYear').value
                    }
                });
                orgState = result.org;
                applyOrgConfig();
                notifyUser('Organization settings saved.');
            } catch (error) {
                notifyUser(error.message);
            }
        }

        async function loadUsers() {
            const result = await apiRequest('users');
            const list = document.getElementById('usersList');
            list.replaceChildren();
            result.users.forEach(user => {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between gap-3 bg-slate-900 px-3 py-2 rounded border border-slate-800 text-xs';
                const name = document.createElement('span');
                name.className = 'font-medium text-slate-200';
                name.textContent = `${user.name} (${user.username})`;
                const role = document.createElement('span');
                role.className = 'text-slate-400 capitalize';
                role.textContent = user.role;
                row.append(name, role);
                list.appendChild(row);
            });
        }

        async function createUser(event) {
            event.preventDefault();
            try {
                await apiRequest('users', {
                    method: 'POST',
                    body: {
                        name: document.getElementById('userName').value,
                        username: document.getElementById('userUsername').value,
                        password: document.getElementById('userPassword').value,
                        role: document.getElementById('userRole').value
                    }
                });
                document.getElementById('userForm').reset();
                await loadUsers();
                notifyUser('User account created.');
            } catch (error) {
                notifyUser(error.message);
            }
        }

        function switchTab(tabId) {
            const tabButton = document.getElementById(`btn-${tabId}`);
            if (!document.getElementById(tabId) || (tabButton && tabButton.classList.contains('hidden'))) return;
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
            if (tabId === 'settingsTab' && currentUser.role === 'admin') {
                loadUsers().catch(error => notifyUser(error.message));
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

        async function handleJournalSubmit(e) {
            e.preventDefault();
            const editId = document.getElementById('editEntryId').value;
            const existingTransaction = ledgerTransactions.find(transaction => transaction.id === editId);
            const entry = {
                id: editId || undefined,
                date: document.getElementById('entryDate').value,
                category: document.getElementById('entryCategory').value,
                subCategory: document.getElementById('entrySubCategory').value,
                description: document.getElementById('entryDescription').value,
                manualDetails: document.getElementById('entryManualDetails').value.trim(),
                amount: parseFloat(document.getElementById('entryAmount').value) || 0,
                method: document.getElementById('entryMethod').value,
                rawOcrText: pendingOcrAttachment?.rawOcrText || existingTransaction?.rawOcrText || '',
                correctedOcrText: pendingOcrAttachment?.correctedOcrText || existingTransaction?.correctedOcrText || '',
                lineItems: pendingOcrAttachment?.lineItems || existingTransaction?.lineItems || []
            };
            if (pendingOcrAttachment?.receiptImage) entry.receiptImage = pendingOcrAttachment.receiptImage;

            try {
                const result = await apiRequest('transaction', {
                    method: 'POST',
                    body: { transaction: entry }
                });
                const index = ledgerTransactions.findIndex(transaction => transaction.id === result.transaction.id);
                if (index >= 0) ledgerTransactions[index] = result.transaction;
                else ledgerTransactions.unshift(result.transaction);
                pendingOcrAttachment = null;
                cancelEditEntry();
                renderAll();
            } catch (error) {
                notifyUser(error.message);
            }
        }

        function editEntry(id) {
            if (!['admin', 'treasurer'].includes(currentUser.role)) return;
            const tx = ledgerTransactions.find(t => t.id === id);
            if(!tx) return;
            pendingOcrAttachment = null;

            document.getElementById('editEntryId').value = tx.id;
            document.getElementById('entryDate').value = tx.date;
            document.getElementById('entryCategory').value = tx.category;
            document.getElementById('entrySubCategory').value = tx.subCategory;
            document.getElementById('entryDescription').value = tx.description;
            document.getElementById('entryManualDetails').value = tx.manualDetails || '';
            document.getElementById('entryAmount').value = tx.amount;
            document.getElementById('entryMethod').value = tx.method;

            document.getElementById('saveEntryBtn').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Update Entry`;
            document.getElementById('cancelEditBtn').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function cancelEditEntry() {
            pendingOcrAttachment = null;
            document.getElementById('editEntryId').value = '';
            document.getElementById('ledgerForm').reset();
            document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('saveEntryBtn').innerHTML = `<i class="fa-solid fa-plus"></i> Add Journal Entry`;
            document.getElementById('cancelEditBtn').classList.add('hidden');
        }

        async function deleteEntry(id) {
            if (!['admin', 'treasurer'].includes(currentUser.role) || !window.confirm('Delete this ledger entry?')) return;
            try {
                await apiRequest('delete_transaction', {
                    method: 'POST',
                    body: { id }
                });
                ledgerTransactions = ledgerTransactions.filter(transaction => transaction.id !== id);
                renderAll();
            } catch (error) {
                notifyUser(error.message);
            }
        }

        // RENDER LEDGER TABLE
        function renderLedgerTable() {
            const tbody = document.getElementById('ledgerTableBody');
            const search = document.getElementById('ledgerSearch').value.toLowerCase();
            tbody.innerHTML = '';

            const filtered = ledgerTransactions.filter(t => {
                return t.description.toLowerCase().includes(search) ||
                    t.subCategory.toLowerCase().includes(search) ||
                    t.category.toLowerCase().includes(search) ||
                    (t.manualDetails || '').toLowerCase().includes(search) ||
                    (t.correctedOcrText || '').toLowerCase().includes(search) ||
                    (t.lineItems || []).some(item => String(item.description || '').toLowerCase().includes(search));
            });

            if(filtered.length === 0) {
                const emptyRow = document.createElement('tr');
                const emptyCell = document.createElement('td');
                emptyCell.colSpan = currentUser.role === 'auditor' ? 7 : 8;
                emptyCell.className = 'text-center py-8 text-slate-500 text-xs';
                emptyCell.textContent = 'No organizational entries found matching your criteria.';
                emptyRow.appendChild(emptyCell);
                tbody.appendChild(emptyRow);
                return;
            }

            const sym = currencySymbols[orgState.currency];

            filtered.forEach(tx => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/40 transition border-b border-slate-800/60";

                let catBadge = 'bg-slate-800 text-slate-300';
                if(tx.category === 'Revenue') catBadge = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                if(tx.category === 'Expense') catBadge = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                if(tx.category === 'Asset') catBadge = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';

                const addCell = (text, className) => {
                    const cell = document.createElement('td');
                    cell.className = className;
                    cell.textContent = text;
                    tr.appendChild(cell);
                    return cell;
                };
                addCell(tx.date, 'py-3 px-4 font-mono text-xs text-slate-400');
                const categoryCell = document.createElement('td');
                categoryCell.className = 'py-3 px-4';
                const categoryBadge = document.createElement('span');
                categoryBadge.className = `px-2 py-0.5 rounded text-[11px] font-semibold ${catBadge}`;
                categoryBadge.textContent = tx.category;
                categoryCell.appendChild(categoryBadge);
                tr.appendChild(categoryCell);
                addCell(tx.subCategory, 'py-3 px-4 font-medium text-slate-200');
                addCell(tx.description, 'py-3 px-4 text-slate-300 max-w-xs truncate');
                const manualDetailsCell = document.createElement('td');
                manualDetailsCell.className = 'py-3 px-4 max-w-xs';
                const manualDetailsPreview = (tx.manualDetails || '').replace(/\s+/g, ' ').trim();
                const lineItems = tx.lineItems || [];
                if (manualDetailsPreview || lineItems.length || tx.correctedOcrText || tx.hasReceiptPhoto) {
                    const preview = document.createElement('div');
                    preview.className = 'max-w-[220px] truncate text-xs text-slate-400';
                    preview.textContent = manualDetailsPreview || (lineItems.length
                        ? `${lineItems.length} itemized item${lineItems.length === 1 ? '' : 's'}`
                        : tx.correctedOcrText ? tx.correctedOcrText.replace(/\s+/g, ' ').trim() : 'Receipt saved');
                    preview.title = preview.textContent;
                    manualDetailsCell.appendChild(preview);
                    const detailsButton = document.createElement('button');
                    detailsButton.className = 'mt-1 text-xs text-blue-400 hover:text-blue-300';
                    detailsButton.textContent = tx.hasReceiptPhoto ? 'View receipt details & photo' : 'View details';
                    detailsButton.addEventListener('click', () => openReceiptDetails(tx));
                    manualDetailsCell.appendChild(detailsButton);
                } else {
                    manualDetailsCell.textContent = '—';
                    manualDetailsCell.className += ' text-slate-500';
                }
                tr.appendChild(manualDetailsCell);
                addCell(`${tx.category === 'Revenue' ? '+' : ''}${sym}${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                    `py-3 px-4 text-right font-mono font-bold ${tx.category === 'Revenue' ? 'text-emerald-400' : 'text-slate-200'}`);
                if (currentUser.role !== 'auditor') {
                    const actionsCell = document.createElement('td');
                    actionsCell.className = 'py-3 px-4 text-center';
                    const editButton = document.createElement('button');
                    editButton.className = 'text-slate-400 hover:text-blue-400 text-xs mr-2';
                    editButton.setAttribute('aria-label', 'Edit entry');
                    editButton.innerHTML = '<i class="fa-solid fa-pen"></i>';
                    editButton.addEventListener('click', () => editEntry(tx.id));
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'text-slate-400 hover:text-rose-400 text-xs';
                    deleteButton.setAttribute('aria-label', 'Delete entry');
                    deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i>';
                    deleteButton.addEventListener('click', () => deleteEntry(tx.id));
                    actionsCell.append(editButton, deleteButton);
                    tr.appendChild(actionsCell);
                }
                tbody.appendChild(tr);
            });
        }

        async function openReceiptDetails(transaction) {
            const dialog = document.getElementById('receiptDialog');
            const manualDetails = document.getElementById('receiptDialogManualDetails');
            const correctedText = document.getElementById('receiptDialogCorrectedText');
            const correctedTextSection = document.getElementById('receiptDialogCorrectedTextSection');
            const image = document.getElementById('receiptDialogImage');
            const noImageMessage = document.getElementById('receiptDialogNoImage');
            manualDetails.textContent = transaction.manualDetails || 'No manual details were entered for this entry.';
            correctedText.textContent = transaction.correctedOcrText || '';
            correctedTextSection.classList.toggle('hidden', !transaction.correctedOcrText);
            renderReceiptDialogLineItems(transaction.lineItems || []);
            image.removeAttribute('src');
            image.classList.add('hidden');
            noImageMessage.classList.toggle('hidden', Boolean(transaction.hasReceiptPhoto));
            dialog.showModal();

            if (!transaction.hasReceiptPhoto) return;
            try {
                const result = await apiRequest('transaction_receipt', { params: { id: transaction.id } });
                image.src = result.image;
                image.classList.remove('hidden');
            } catch (error) {
                notifyUser(error.message);
            }
        }

        function renderReceiptDialogLineItems(items) {
            const section = document.getElementById('receiptDialogLineItemsSection');
            const body = document.getElementById('receiptDialogLineItems');
            body.innerHTML = '';
            section.classList.toggle('hidden', items.length === 0);
            items.forEach(item => {
                const row = document.createElement('tr');
                [item.description, item.quantity, item.unit || '—', item.unitPrice, item.lineTotal].forEach((value, index) => {
                    const cell = document.createElement('td');
                    cell.className = `p-2 ${index > 0 && index !== 2 ? 'text-right font-mono' : ''}`;
                    cell.textContent = index === 3 || index === 4
                        ? (value === null || value === '' ? '—' : Number(value).toFixed(2))
                        : String(value ?? '—');
                    row.appendChild(cell);
                });
                body.appendChild(row);
            });
        }

        // FINANCIAL STATEMENTS CALCULATOR
        function calculateAndRenderFS() {
            const sym = currencySymbols[orgState.currency];
            const subCategorySums = {
                Revenue: new Map(),
                Expense: new Map(),
                Asset: new Map(),
                Liability: new Map(),
                Equity: new Map()
            };
            let totalRevenue = 0, totalExpense = 0;
            let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
            let liquidCash = 0;

            ledgerTransactions.forEach(t => {
                const amt = t.amount;
                const categorySums = subCategorySums[t.category];
                if (categorySums) {
                    categorySums.set(t.subCategory, (categorySums.get(t.subCategory) || 0) + amt);
                }

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

            subCategorySums.Revenue.forEach((val, sub) => {
                if(val > 0) {
                    appendFinancialStatementRow(fsRevRows, sub, val);
                }
            });

            subCategorySums.Expense.forEach((val, sub) => {
                if(val > 0) {
                    appendFinancialStatementRow(fsExpRows, sub, val, 'font-mono text-rose-400');
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
            
            subCategorySums.Asset.forEach((val, sub) => {
                if(sub.includes('Cash')) return;
                if(val > 0) appendFinancialStatementRow(fsAssetRows, sub, val);
            });

            fsLiabRows.innerHTML = '';
            subCategorySums.Liability.forEach((val, sub) => {
                if(val > 0) appendFinancialStatementRow(fsLiabRows, sub, val);
            });
            if(!fsLiabRows.innerHTML) fsLiabRows.innerHTML = `<div class="text-xs text-slate-500 italic py-1">No outstanding liabilities</div>`;

            fsEquityRows.innerHTML = '';
            subCategorySums.Equity.forEach((val, sub) => {
                if(val > 0) appendFinancialStatementRow(fsEquityRows, sub, val);
            });

            const totalEquitiesCombined = totalEquity + netSurplus;
            const totalAssetsCombined = liquidCash + (totalAssets - (subCategorySums.Asset.get('Cash / Operating Bank') || 0));
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

        }

        function appendFinancialStatementRow(container, label, amount, amountClass = 'font-mono') {
            const row = document.createElement('div');
            row.className = 'flex justify-between py-1.5 text-slate-300';
            const labelElement = document.createElement('span');
            labelElement.textContent = label;
            const amountElement = document.createElement('span');
            amountElement.className = amountClass;
            amountElement.textContent = `${currencySymbols[orgState.currency]}${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            row.append(labelElement, amountElement);
            container.appendChild(row);
        }

        // RENDER DASHBOARD KPI & CHARTS
        function renderDashboard() {
            const sym = currencySymbols[orgState.currency];
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
            const isLight = document.body.dataset.theme === 'light';
            const isMobile = window.matchMedia('(max-width: 639px)').matches;
            const chartTextColor = isLight ? '#475569' : '#94a3b8';
            const chartGridColor = isLight ? '#e2e8f0' : '#334155';
            const incomeExpenseByCategory = {};
            ledgerTransactions.forEach(transaction => {
                if (!['Revenue', 'Expense'].includes(transaction.category)) return;
                const category = transaction.subCategory;
                if (!incomeExpenseByCategory[category]) incomeExpenseByCategory[category] = { revenue: 0, expense: 0 };
                incomeExpenseByCategory[category][transaction.category === 'Revenue' ? 'revenue' : 'expense'] += Number(transaction.amount);
            });

            const incomeExpenseCtx = document.getElementById('incomeExpenseChart').getContext('2d');
            if(incomeExpenseChartInstance) incomeExpenseChartInstance.destroy();

            incomeExpenseChartInstance = new Chart(incomeExpenseCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(incomeExpenseByCategory),
                    datasets: [
                        { label: 'Revenues', data: Object.values(incomeExpenseByCategory).map(values => values.revenue), backgroundColor: '#10b981' },
                        { label: 'Expenses', data: Object.values(incomeExpenseByCategory).map(values => values.expense), backgroundColor: '#f43f5e' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: chartTextColor } } },
                    scales: {
                        x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
                        y: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
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
                    plugins: { legend: { position: isMobile ? 'bottom' : 'right', labels: { color: chartTextColor } } }
                }
            });
        }

        // EXPORT CSV
        function exportCSV() {
            if(ledgerTransactions.length === 0) {
                notifyUser('There are no ledger entries to export.');
                return;
            }
            const fields = ['id', 'date', 'category', 'subCategory', 'description', 'method', 'amount'];
            const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
            let csv = "ID,Date,Category,SubCategory,Description,Method,Amount (PHP)\n";
            ledgerTransactions.forEach(t => {
                csv += `${fields.map(field => quote(t[field])).join(',')}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `${orgState.name.replace(/\s+/g, '_')}_Ledger.csv`);
            a.click();
            window.URL.revokeObjectURL(url);
        }
    
