
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
        let activeOcrImage = null;
        let ocrRawText = '';
        let ocrTextImage = null;
        let localOcrWorkerPromise = null;
        let ocrProgressHandler = null;
        let ocrCropStart = null;
        let ocrCropDraft = null;
        let ocrLineItems = [];
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

        // PHOTO-TO-TEXT RECEIPT SCANNER
        function clearOcrFields() {
            document.getElementById('ocrVendor').value = '';
            document.getElementById('ocrDate').value = '';
            document.getElementById('ocrAmount').value = '';
            document.getElementById('ocrSubCat').value = '';
            ocrRawText = '';
            ocrTextImage = null;
            document.getElementById('ocrCorrectedText').value = '';
            document.getElementById('ocrLineItemsList').innerHTML = '';
            ocrLineItems = [];
            document.getElementById('ocrPostBtn').disabled = true;
        }

        function addOcrLineItem(item = {}) {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-2 md:grid-cols-12 gap-2 items-end rounded-lg border border-slate-800 bg-slate-950/60 p-2';
            const addInput = (labelText, name, value, type, step, span) => {
                const wrapper = document.createElement('label');
                wrapper.className = `text-[10px] font-semibold text-slate-500 ${span}`;
                wrapper.textContent = labelText;
                const input = document.createElement('input');
                input.type = type;
                input.dataset.lineItemField = name;
                input.value = value ?? '';
                input.className = 'mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200';
                if (step) input.step = step;
                if (type === 'number') input.min = name === 'quantity' ? '0.001' : '0';
                wrapper.appendChild(input);
                row.appendChild(wrapper);
            };
            addInput('Description', 'description', item.description, 'text', '', 'col-span-2 md:col-span-4');
            addInput('Quantity', 'quantity', item.quantity, 'number', '0.001', 'col-span-1 md:col-span-2');
            addInput('Unit', 'unit', item.unit, 'text', '', 'col-span-1 md:col-span-2');
            addInput('Unit price', 'unitPrice', item.unitPrice, 'number', '0.01', 'col-span-1 md:col-span-2');
            addInput('Line total', 'lineTotal', item.lineTotal, 'number', '0.01', 'col-span-1 md:col-span-2');
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'col-span-2 justify-self-end rounded px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950/50';
            removeButton.textContent = 'Remove item';
            removeButton.addEventListener('click', () => {
                row.remove();
                collectOcrLineItems();
            });
            row.appendChild(removeButton);
            document.getElementById('ocrLineItemsList').appendChild(row);
            collectOcrLineItems();
        }

        function collectOcrLineItems() {
            ocrLineItems = [...document.querySelectorAll('#ocrLineItemsList > div')].map(row => {
                const read = name => row.querySelector(`[data-line-item-field="${name}"]`).value.trim();
                const numberOrNull = value => value === '' ? null : Number(value);
                return {
                    description: read('description'),
                    quantity: numberOrNull(read('quantity')),
                    unit: read('unit'),
                    unitPrice: numberOrNull(read('unitPrice')),
                    lineTotal: numberOrNull(read('lineTotal'))
                };
            });
            return ocrLineItems;
        }

        function setOcrLineItems(items) {
            const container = document.getElementById('ocrLineItemsList');
            container.innerHTML = '';
            ocrLineItems = [];
            items.forEach(item => addOcrLineItem(item));
        }

        function setOcrStatus(message, color) {
            const badge = document.getElementById('ocrStatusBadge');
            badge.textContent = message;
            const colorClasses = {
                slate: 'bg-slate-800 text-slate-400',
                blue: 'bg-blue-500/20 text-blue-400',
                rose: 'bg-rose-500/20 text-rose-400',
                amber: 'bg-amber-500/20 text-amber-400',
                emerald: 'bg-emerald-500/20 text-emerald-400'
            };
            badge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${colorClasses[color] || colorClasses.slate}`;
        }

        function retakeOcrPhoto() {
            const cameraInput = document.getElementById('ocrCameraInput');
            cameraInput.value = '';
            cameraInput.click();
        }

        function clearOcrPhoto() {
            activeOcrImage = null;
            ocrCropStart = null;
            ocrCropDraft = null;
            pendingOcrAttachment = null;
            document.getElementById('ocrImgPreview').removeAttribute('src');
            document.getElementById('ocrPreviewContainer').classList.add('hidden');
            document.getElementById('ocrUploadPrompt').classList.remove('hidden');
            document.getElementById('ocrCropControls').classList.add('hidden');
            document.getElementById('ocrPreviewContainer').classList.remove('ocr-crop-mode');
            document.getElementById('ocrCropOverlay').classList.add('hidden');
            document.getElementById('ocrCropSelection').classList.add('hidden');
            document.getElementById('ocrCameraInput').value = '';
            document.getElementById('ocrFileInput').value = '';
            document.getElementById('ocrBoxOverlays').innerHTML = '';
            document.getElementById('scanLaser').classList.add('hidden');
            document.getElementById('ocrScanBtn').disabled = true;
            document.getElementById('ocrGeminiBtn').disabled = true;
            clearOcrFields();
            setOcrStatus('Awaiting Upload', 'slate');
        }

        function handleImageFile(e) {
            const input = e.target;
            const file = input.files[0];
            if(!file) return;
            clearOcrPhoto();

            if (!file.type.startsWith('image/')) {
                setOcrStatus('Please choose an image file', 'rose');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                if(typeof evt.target.result !== 'string') {
                    setOcrStatus('Could not load image', 'rose');
                    return;
                }

                activeOcrImage = { imgSrc: evt.target.result };

                document.getElementById('ocrUploadPrompt').classList.add('hidden');
                document.getElementById('ocrPreviewContainer').classList.remove('hidden');
                document.getElementById('ocrImgPreview').src = evt.target.result;
                document.getElementById('ocrCropControls').classList.remove('hidden');
                updateOcrCropControls();
                clearOcrFields();
                setOcrStatus('Image Ready for Scan', 'blue');
                document.getElementById('ocrBoxOverlays').innerHTML = '';

                document.getElementById('ocrScanBtn').disabled = false;
                document.getElementById('ocrGeminiBtn').disabled = false;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.onerror = function() {
                activeOcrImage = null;
                setOcrStatus('Could not load image', 'rose');
                document.getElementById('ocrScanBtn').disabled = true;
                document.getElementById('ocrGeminiBtn').disabled = true;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.readAsDataURL(file);
        }

        function toggleOcrCropMode() {
            if (!activeOcrImage) return;
            const preview = document.getElementById('ocrPreviewContainer');
            preview.classList.toggle('ocr-crop-mode');
            const cropMode = preview.classList.contains('ocr-crop-mode');
            document.getElementById('ocrScanBtn').disabled = cropMode;
            document.getElementById('ocrGeminiBtn').disabled = cropMode;
            document.getElementById('ocrCropOverlay').classList.toggle('hidden', !cropMode && !activeOcrImage.crop);
            if (cropMode) {
                document.getElementById('ocrBoxOverlays').innerHTML = '';
                clearOcrFields();
            }
            ocrCropStart = null;
            ocrCropDraft = null;
            renderOcrCropSelection(activeOcrImage.crop);
            updateOcrCropControls();
            if (cropMode) {
                setOcrStatus('Drag around the printed receipt area', 'amber');
            } else {
                setOcrStatus(activeOcrImage.crop ? 'Receipt area selected — scan for clearer text' : 'Image Ready for Scan', 'blue');
            }
        }

        function useFullOcrPhoto() {
            if (!activeOcrImage) return;
            activeOcrImage.crop = null;
            ocrCropStart = null;
            ocrCropDraft = null;
            document.getElementById('ocrPreviewContainer').classList.remove('ocr-crop-mode');
            document.getElementById('ocrCropOverlay').classList.add('hidden');
            document.getElementById('ocrCropSelection').classList.add('hidden');
            document.getElementById('ocrBoxOverlays').innerHTML = '';
            clearOcrFields();
            document.getElementById('ocrScanBtn').disabled = false;
            document.getElementById('ocrGeminiBtn').disabled = false;
            setOcrStatus('Using full photo — scan and review the result', 'blue');
            updateOcrCropControls();
        }

        function updateOcrCropControls() {
            const cropMode = document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode');
            const cropButton = document.getElementById('ocrCropModeBtn');
            const hint = document.getElementById('ocrCropHint');
            cropButton.innerHTML = cropMode
                ? '<i class="fa-solid fa-crop-simple mr-1"></i> Drag around receipt'
                : activeOcrImage?.crop
                    ? '<i class="fa-solid fa-crop-simple mr-1"></i> Adjust receipt area'
                    : '<i class="fa-solid fa-crop-simple mr-1"></i> Select receipt area';
            hint.textContent = cropMode
                ? 'Drag from one corner of the printed receipt to the opposite corner.'
                : activeOcrImage?.crop
                    ? 'Scanning only the selected receipt area. Select again to adjust.'
                    : 'For small receipts, select the printed area to improve OCR accuracy.';
        }

        function ocrImagePoint(event) {
            const image = document.getElementById('ocrImgPreview');
            const bounds = image.getBoundingClientRect();
            if (!bounds.width || !bounds.height
                || event.clientX < bounds.left || event.clientX > bounds.right
                || event.clientY < bounds.top || event.clientY > bounds.bottom) {
                return null;
            }
            return {
                x: (event.clientX - bounds.left) * image.naturalWidth / bounds.width,
                y: (event.clientY - bounds.top) * image.naturalHeight / bounds.height
            };
        }

        function renderOcrCropSelection(rect) {
            const image = document.getElementById('ocrImgPreview');
            const overlay = document.getElementById('ocrCropOverlay');
            const selection = document.getElementById('ocrCropSelection');
            const bounds = image.getBoundingClientRect();
            const overlayBounds = overlay.getBoundingClientRect();
            if (!rect || !bounds.width || !bounds.height || !overlayBounds.width || !overlayBounds.height) {
                selection.classList.add('hidden');
                return;
            }

            const left = bounds.left - overlayBounds.left + rect.x * bounds.width / image.naturalWidth;
            const top = bounds.top - overlayBounds.top + rect.y * bounds.height / image.naturalHeight;
            selection.style.left = `${left}px`;
            selection.style.top = `${top}px`;
            selection.style.width = `${rect.width * bounds.width / image.naturalWidth}px`;
            selection.style.height = `${rect.height * bounds.height / image.naturalHeight}px`;
            selection.classList.remove('hidden');
        }

        function startOcrCrop(event) {
            if (!activeOcrImage || !document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode')) return;
            const point = ocrImagePoint(event);
            if (!point) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            ocrCropStart = point;
            ocrCropDraft = { x: point.x, y: point.y, width: 0, height: 0 };
            document.getElementById('ocrCropOverlay').classList.remove('hidden');
            renderOcrCropSelection(ocrCropDraft);
        }

        function moveOcrCrop(event) {
            if (!ocrCropStart) return;
            const point = ocrImagePoint(event);
            if (!point) return;
            ocrCropDraft = {
                x: Math.min(ocrCropStart.x, point.x),
                y: Math.min(ocrCropStart.y, point.y),
                width: Math.abs(point.x - ocrCropStart.x),
                height: Math.abs(point.y - ocrCropStart.y)
            };
            renderOcrCropSelection(ocrCropDraft);
        }

        function finishOcrCrop(event) {
            if (!ocrCropStart || !activeOcrImage) return;
            moveOcrCrop(event);
            ocrCropStart = null;
            if (!ocrCropDraft || ocrCropDraft.width < 40 || ocrCropDraft.height < 40) {
                ocrCropDraft = null;
                renderOcrCropSelection(activeOcrImage.crop);
                setOcrStatus('Crop too small — drag around the receipt text', 'rose');
                return;
            }

            activeOcrImage.crop = ocrCropDraft;
            ocrCropDraft = null;
            document.getElementById('ocrPreviewContainer').classList.remove('ocr-crop-mode');
            document.getElementById('ocrCropOverlay').classList.remove('hidden');
            clearOcrFields();
            document.getElementById('ocrScanBtn').disabled = false;
            document.getElementById('ocrGeminiBtn').disabled = false;
            renderOcrCropSelection(activeOcrImage.crop);
            setOcrStatus('Receipt area selected — scan for clearer text', 'blue');
            updateOcrCropControls();
        }

        function cancelOcrCrop(event) {
            if (!ocrCropStart) return;
            ocrCropStart = null;
            ocrCropDraft = null;
            renderOcrCropSelection(activeOcrImage?.crop);
        }

        function prepareImageForOcr(dataUrl, crop = null) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const source = crop || { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
                    const longestSide = Math.max(source.width, source.height);
                    const scale = Math.min(2, 2800 / longestSide);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(source.width * scale));
                    canvas.height = Math.max(1, Math.round(source.height * scale));
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    if (!context) {
                        reject(new Error('Could not enhance the receipt image for scanning.'));
                        return;
                    }

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.imageSmoothingQuality = 'high';
                    context.drawImage(
                        image,
                        source.x, source.y, source.width, source.height,
                        0, 0, canvas.width, canvas.height
                    );

                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const pixels = imageData.data;
                    for (let index = 0; index < pixels.length; index += 4) {
                        const grayscale = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
                        const enhanced = Math.max(0, Math.min(255, (grayscale - 128) * 1.25 + 128));
                        pixels[index] = enhanced;
                        pixels[index + 1] = enhanced;
                        pixels[index + 2] = enhanced;
                    }
                    context.putImageData(imageData, 0, 0);
                    resolve({
                        src: canvas.toDataURL('image/png'),
                        scaleX: canvas.width / source.width,
                        scaleY: canvas.height / source.height,
                        crop: source
                    });
                };
                image.onerror = () => reject(new Error('Could not enhance the receipt image for scanning.'));
                image.src = dataUrl;
            });
        }

        function renderOcrWordBoxes(words, preparedImage) {
            const image = document.getElementById('ocrImgPreview');
            const overlay = document.getElementById('ocrBoxOverlays');
            if (!image.naturalWidth || !image.naturalHeight) return;

            const imageRect = image.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();
            if (!overlayRect.width || !overlayRect.height) return;
            words.filter(word => word.text.trim() && word.confidence >= 45 && word.bbox).forEach(word => {
                const box = document.createElement('div');
                box.className = 'ocr-box';
                const x = preparedImage.crop.x + word.bbox.x0 / preparedImage.scaleX;
                const y = preparedImage.crop.y + word.bbox.y0 / preparedImage.scaleY;
                const width = (word.bbox.x1 - word.bbox.x0) / preparedImage.scaleX;
                const height = (word.bbox.y1 - word.bbox.y0) / preparedImage.scaleY;
                box.style.left = `${((imageRect.left - overlayRect.left + x * imageRect.width / image.naturalWidth) / overlayRect.width) * 100}%`;
                box.style.top = `${((imageRect.top - overlayRect.top + y * imageRect.height / image.naturalHeight) / overlayRect.height) * 100}%`;
                box.style.width = `${(width * imageRect.width / image.naturalWidth / overlayRect.width) * 100}%`;
                box.style.height = `${(height * imageRect.height / image.naturalHeight / overlayRect.height) * 100}%`;
                overlay.appendChild(box);
            });
        }

        function parseOcrDate(text) {
            const isoDate = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
            if (isoDate) {
                return `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
            }

            const localDate = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
            if (localDate) {
                const year = localDate[3].length === 2 ? `20${localDate[3]}` : localDate[3];
                return `${year}-${localDate[1].padStart(2, '0')}-${localDate[2].padStart(2, '0')}`;
            }

            const namedDate = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/i)
                || text.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,]?\s+20\d{2}\b/i);
            if (!namedDate) return '';

            const parsedDate = new Date(namedDate[0].replace(/(\d)(st|nd|rd|th)\b/i, '$1'));
            if (Number.isNaN(parsedDate.getTime())) return '';
            return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
        }

        function parseReceiptText(text) {
            const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            const amountPattern = /(?:₱|PHP|USD|\$|\bP\s*)\s*-?\s*\d[\d,]*(?:\.\d{1,2})?|-?\d[\d,]*\.\d{2}/gi;
            const amountLines = lines.map(line => ({
                line,
                amounts: [...line.matchAll(amountPattern)].map(match => Number(match[0].replace(/[^\d.-]/g, '')))
                    .filter(amount => Number.isFinite(amount) && amount > 0)
            })).filter(entry => entry.amounts.length);
            const totalLine = amountLines.filter(entry => /\b(grand\s*total|total|amount\s*due|balance\s*due|net\s*amount)\b/i.test(entry.line) && !/\bsub\s*total\b/i.test(entry.line));
            const amount = (totalLine.length ? totalLine[totalLine.length - 1] : amountLines[amountLines.length - 1])?.amounts.slice(-1)[0] ?? '';

            const vendor = lines.map(line => line.replace(/\b(?:official\s+)?receipt\b|\binvoice\b/ig, '').trim())
                .find(line => /[a-z]/i.test(line)
                    && !/\b(tax|date|tel|phone|cashier|terminal|transaction|order|customer|payment|total|vat|tin)\b/i.test(line)
                    && !/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line)) || '';
            const receiptText = lines.join('\n');

            return {
                vendor,
                date: parseOcrDate(receiptText),
                amount,
                rawText: receiptText
            };
        }

        function prepareReceiptImage(dataUrl) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const maxDimension = 2000;
                    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                    const context = canvas.getContext('2d');
                    if (!context) {
                        reject(new Error('Could not prepare the receipt image for storage.'));
                        return;
                    }

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);

                    const maxBytes = 3 * 1024 * 1024;
                    let quality = 0.84;
                    let compressedImage = canvas.toDataURL('image/jpeg', quality);
                    while (Math.ceil((compressedImage.length - compressedImage.indexOf(',') - 1) * 0.75) > maxBytes && quality > 0.5) {
                        quality = Math.max(0.5, quality - 0.08);
                        compressedImage = canvas.toDataURL('image/jpeg', quality);
                    }
                    if (Math.ceil((compressedImage.length - compressedImage.indexOf(',') - 1) * 0.75) > maxBytes) {
                        reject(new Error('This receipt image is too large to store. Choose a smaller image.'));
                        return;
                    }
                    resolve(compressedImage);
                };
                image.onerror = () => reject(new Error('Could not prepare the receipt image for storage.'));
                image.src = dataUrl;
            });
        }

        function prepareImageForAi(dataUrl, crop = null) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const source = crop || { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
                    const scale = Math.min(2, 1800 / Math.max(source.width, source.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(source.width * scale));
                    canvas.height = Math.max(1, Math.round(source.height * scale));
                    const context = canvas.getContext('2d');
                    if (!context) {
                        reject(new Error('Could not prepare the receipt photo for Gemini.'));
                        return;
                    }

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.imageSmoothingQuality = 'high';
                    context.drawImage(
                        image,
                        source.x, source.y, source.width, source.height,
                        0, 0, canvas.width, canvas.height
                    );

                    const maxBytes = 3 * 1024 * 1024;
                    let quality = 0.88;
                    let preparedImage = canvas.toDataURL('image/jpeg', quality);
                    while (Math.ceil((preparedImage.length - preparedImage.indexOf(',') - 1) * 0.75) > maxBytes && quality > 0.5) {
                        quality = Math.max(0.5, quality - 0.08);
                        preparedImage = canvas.toDataURL('image/jpeg', quality);
                    }
                    if (Math.ceil((preparedImage.length - preparedImage.indexOf(',') - 1) * 0.75) > maxBytes) {
                        reject(new Error('This receipt photo is too large to send for AI analysis. Select a smaller area or image.'));
                        return;
                    }
                    resolve(preparedImage);
                };
                image.onerror = () => reject(new Error('Could not prepare the receipt photo for Gemini.'));
                image.src = dataUrl;
            });
        }

        function getLocalOcrWorker() {
            if (!window.Tesseract) {
                throw new Error('The local OCR engine did not load. Check that the bundled OCR files are present.');
            }
            if (!localOcrWorkerPromise) {
                localOcrWorkerPromise = window.Tesseract.createWorker('eng', 1, {
                    workerPath: new URL('vendor/tesseract/worker.min.js', document.baseURI).href,
                    corePath: new URL('vendor/tesseract-core/', document.baseURI).href,
                    langPath: new URL('vendor/tessdata/', document.baseURI).href,
                    gzip: true,
                    logger: progress => {
                        if (typeof ocrProgressHandler === 'function') ocrProgressHandler(progress);
                    }
                }).catch(error => {
                    localOcrWorkerPromise = null;
                    throw error;
                });
            }
            return localOcrWorkerPromise;
        }

        async function recognizeReceiptLocally(imageToScan, badge) {
            const preparedImage = await prepareImageForOcr(imageToScan.imgSrc, imageToScan.crop);
            if (activeOcrImage !== imageToScan) return false;

            ocrProgressHandler = progress => {
                if (progress.status === 'recognizing text' && Number.isFinite(progress.progress)) {
                    setOcrStatus(`Reading receipt locally... ${Math.round(progress.progress * 100)}%`, 'amber');
                    badge.classList.add('animate-pulse');
                } else if (progress.status === 'loading language traineddata') {
                    setOcrStatus('Loading bundled English OCR data...', 'amber');
                }
            };
            try {
                const worker = await getLocalOcrWorker();
                if (activeOcrImage !== imageToScan) return false;
                const recognition = await worker.recognize(preparedImage.src);
                if (activeOcrImage !== imageToScan) return false;

                const result = parseReceiptText(recognition.data.text);
                renderOcrWordBoxes(recognition.data.words || [], preparedImage);
                document.getElementById('ocrVendor').value = result.vendor;
                document.getElementById('ocrDate').value = result.date;
                document.getElementById('ocrAmount').value = result.amount;
                document.getElementById('ocrSubCat').value = '';
                ocrRawText = result.rawText;
                document.getElementById('ocrCorrectedText').value = result.rawText;
                ocrTextImage = imageToScan;
                document.getElementById('ocrPostBtn').disabled = !ocrRawText;
                return Boolean(ocrRawText);
            } finally {
                ocrProgressHandler = null;
            }
        }

        function setOcrActionsDisabled(disabled) {
            const unavailable = !activeOcrImage
                || document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode');
            document.getElementById('ocrScanBtn').disabled = disabled || unavailable;
            document.getElementById('ocrGeminiBtn').disabled = disabled || unavailable;
        }

        async function runOcrScan() {
            const imageToScan = activeOcrImage;
            if (!imageToScan || document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode')) return;

            const badge = document.getElementById('ocrStatusBadge');
            document.getElementById('scanLaser').classList.remove('hidden');
            document.getElementById('ocrBoxOverlays').innerHTML = '';
            document.getElementById('ocrCropOverlay').classList.add('hidden');
            document.getElementById('ocrPostBtn').disabled = true;
            setOcrActionsDisabled(true);
            setOcrStatus('Preparing local receipt scan...', 'amber');
            badge.classList.add('animate-pulse');

            try {
                const foundText = await recognizeReceiptLocally(imageToScan, badge);
                if (activeOcrImage !== imageToScan) return;
                setOcrStatus(
                    foundText ? 'Local OCR ready — review fields and complete the subcategory' : 'No text found — try a clearer photo',
                    foundText ? 'emerald' : 'rose'
                );
            } catch (error) {
                if (activeOcrImage !== imageToScan) return;
                setOcrStatus('Local OCR could not start', 'rose');
                notifyUser(error.message);
            } finally {
                badge.classList.remove('animate-pulse');
                document.getElementById('scanLaser').classList.add('hidden');
                setOcrActionsDisabled(false);
            }
        }

        async function analyzeOcrWithGemini() {
            const imageToScan = activeOcrImage;
            if (!imageToScan || document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode')) return;

            const badge = document.getElementById('ocrStatusBadge');
            let localOcrError = '';
            document.getElementById('scanLaser').classList.remove('hidden');
            document.getElementById('ocrPostBtn').disabled = true;
            setOcrActionsDisabled(true);
            badge.classList.add('animate-pulse');

            try {
                if (ocrTextImage !== imageToScan) {
                    setOcrStatus('Reading receipt locally before online analysis...', 'amber');
                    try {
                        await recognizeReceiptLocally(imageToScan, badge);
                    } catch (error) {
                        localOcrError = error.message;
                    }
                }
                if (activeOcrImage !== imageToScan) return;
                setOcrStatus('Sending selected photo area to Gemini...', 'amber');
                const aiImage = await prepareImageForAi(imageToScan.imgSrc, imageToScan.crop);
                if (activeOcrImage !== imageToScan) return;
                const response = await apiRequest('receipt_ai', {
                    method: 'POST',
                    body: { image: aiImage }
                });
                if (activeOcrImage !== imageToScan) return;
                const analysis = response.analysis;
                if (analysis.vendor) document.getElementById('ocrVendor').value = analysis.vendor;
                if (analysis.date) document.getElementById('ocrDate').value = analysis.date;
                if (analysis.amount !== '' && Number(analysis.amount) > 0) {
                    document.getElementById('ocrAmount').value = analysis.amount;
                }
                document.getElementById('ocrSubCat').value = analysis.subCategory || '';
                document.getElementById('ocrCorrectedText').value = analysis.correctedText || '';
                setOcrLineItems(Array.isArray(analysis.lineItems) ? analysis.lineItems : []);
                const hasRequiredFields = document.getElementById('ocrVendor').value.trim()
                    && document.getElementById('ocrDate').value
                    && Number(document.getElementById('ocrAmount').value) > 0;
                document.getElementById('ocrPostBtn').disabled = !hasRequiredFields;
                setOcrStatus(
                    hasRequiredFields ? 'Gemini suggestions ready — review before posting' : 'Gemini analysis ready — complete missing fields',
                    'amber'
                );
            } catch (error) {
                if (activeOcrImage !== imageToScan) return;
                const hasLocalText = ocrRawText.trim();
                if (hasLocalText) {
                    document.getElementById('ocrPostBtn').disabled = false;
                    setOcrStatus('Gemini unavailable — local OCR is ready', 'amber');
                } else {
                    setOcrStatus('Gemini unavailable — try local OCR', 'rose');
                }
                notifyUser(`${error.message}${localOcrError ? ` Local OCR note: ${localOcrError}` : ''}`);
            } finally {
                badge.classList.remove('animate-pulse');
                document.getElementById('scanLaser').classList.add('hidden');
                setOcrActionsDisabled(false);
            }
        }

        async function postOcrToLedger() {
            const imageToPost = activeOcrImage;
            if(!imageToPost) return;

            const vendor = document.getElementById('ocrVendor').value.trim();
            const date = document.getElementById('ocrDate').value;
            const amount = Number(document.getElementById('ocrAmount').value);
            const subCategory = document.getElementById('ocrSubCat').value.trim();
            if (!vendor || !date || !Number.isFinite(amount) || amount <= 0) {
                notifyUser('Review the extracted fields and enter a vendor, date, and valid amount before posting.');
                return;
            }
            if (!subCategory || subCategory.length > 100) {
                notifyUser('Enter a subcategory of 100 characters or fewer before posting.');
                return;
            }
            const enteredItems = collectOcrLineItems();
            const invalidItem = enteredItems.some(item => {
                const hasValues = item.description || item.quantity !== null || item.unit || item.unitPrice !== null || item.lineTotal !== null;
                return hasValues && (!item.description || item.description.length > 200 || item.unit.length > 32
                    || (item.quantity !== null && (!Number.isFinite(item.quantity) || item.quantity <= 0))
                    || (item.unitPrice !== null && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0))
                    || (item.lineTotal !== null && (!Number.isFinite(item.lineTotal) || item.lineTotal < 0)));
            });
            if (invalidItem) {
                notifyUser('Complete each item description and check its quantity and prices before posting.');
                return;
            }
            const lineItems = enteredItems.filter(item => item.description);

            const postButton = document.getElementById('ocrPostBtn');
            postButton.disabled = true;
            try {
                const receiptImage = await prepareReceiptImage(imageToPost.imgSrc);
                if (activeOcrImage !== imageToPost) return;
                pendingOcrAttachment = {
                    rawOcrText: ocrRawText,
                    correctedOcrText: document.getElementById('ocrCorrectedText').value,
                    lineItems,
                    receiptImage
                };
            } catch (error) {
                notifyUser(error.message);
                return;
            } finally {
                postButton.disabled = !activeOcrImage;
            }

            switchTab('ledgerTab');

            document.getElementById('entryDate').value = date;
            document.getElementById('entryCategory').value = 'Expense';
            document.getElementById('entrySubCategory').value = subCategory;
            document.getElementById('entryDescription').value = vendor;
            document.getElementById('entryAmount').value = amount;
            document.getElementById('entryMethod').value = "Cash / Bank Transfer";

            window.scrollTo({ top: 0, behavior: 'smooth' });
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
    
