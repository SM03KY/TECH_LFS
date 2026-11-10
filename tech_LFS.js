
        // ACCOUNT CATEGORIES TAILORED FOR ORGANIZATIONS
        const accountCategories = {
            Revenue: ["Membership Dues", "Grants & Sponsorships", "Donations & Contributions", "Event & Ticket Sales", "Service Consulting Revenue"],
            Expense: ["Program Expenses", "Event Expenses", "Research & Lab Supplies", "Salaries & Honorariums", "Office & Admin Expense", "Travel & Transportation", "Utilities & Rent"],
            Asset: ["Cash / Operating Bank", "Grant Dedicated Account", "Accounts Receivable / Pledges", "Equipment & Assets"],
            Liability: ["Accounts Payable", "Accrued Vendor Bills", "Short-term Credit Card"],
            Equity: ["Unrestricted Fund Balance", "Restricted Grant Fund Balance"]
        };

        const ocrPresets = {
            gala: {
                vendor: "Grand Palace Catering",
                date: "2026-11-06",
                amount: 1850.00,
                subCategory: "Event Expenses",
                rawText: "GRAND PALACE CATERING\nDate: 2026-11-06\nBanquet Catering (100 pax) - ₱1,500.00\nAudio/Visual Rental - ₱350.00\nTotal Amount: ₱1,850.00\nPaid in Full",
                imgSrc: "https://placehold.co/500x700/0f172a/3b82f6?text=ANNUAL+GALA+CATERING%0A%0AGrand+Palace%0ADate:+2026-11-06%0ATotal:+₱1,850.00"
            },
            grant: {
                vendor: "TechLab Scientific Ltd",
                date: "2026-11-05",
                amount: 3400.00,
                subCategory: "Research & Lab Supplies",
                rawText: "TECHLAB SCIENTIFIC INVOICE\nDate: 2026-11-05\nInvoice #TL-8841\nHigh-Performance Compute Node - ₱3,400.00\nGrant Code: RES-2026\nPayment Status: Completed",
                imgSrc: "https://placehold.co/500x700/1e1b4b/6366f1?text=GRANT+RESEARCH+INVOICE%0A%0ATechLab+Scientific%0ADate:+2026-11-05%0ATotal:+₱3,400.00"
            },
            office: {
                vendor: "Metro Office & Utilities",
                date: "2026-11-07",
                amount: 215.80,
                subCategory: "Office & Admin Expense",
                rawText: "METRO UTILITIES & OFFICE\nDate: 2026-11-07\nFiber Internet Billing - ₱140.00\nPaper & Office Supplies - ₱75.80\nTOTAL: ₱215.80\nPaid via Transfer",
                imgSrc: "https://placehold.co/500x700/14532d/22c55e?text=HQ+OFFICE+RECEIPT%0A%0AMetro+Utilities%0ADate:+2026-11-07%0ATotal:+₱215.80"
            }
        };

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
        let activeOcrPreset = null;
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
            populateSubCategories();
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
                rawOcrText: pendingOcrAttachment?.rawOcrText || existingTransaction?.rawOcrText || ''
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
            populateSubCategories();
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
            populateSubCategories();
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
                    (t.rawOcrText || '').toLowerCase().includes(search);
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
                if (manualDetailsPreview) {
                    const preview = document.createElement('div');
                    preview.className = 'max-w-[220px] truncate text-xs text-slate-400';
                    preview.textContent = manualDetailsPreview;
                    preview.title = manualDetailsPreview;
                    manualDetailsCell.appendChild(preview);
                    const detailsButton = document.createElement('button');
                    detailsButton.className = 'mt-1 text-xs text-blue-400 hover:text-blue-300';
                    detailsButton.textContent = 'View details';
                    detailsButton.addEventListener('click', () => openReceiptDetails(tx));
                    manualDetailsCell.appendChild(detailsButton);
                } else {
                    manualDetailsCell.textContent = '—';
                    manualDetailsCell.className += ' text-slate-500';
                }
                tr.appendChild(manualDetailsCell);
                const ocrCell = document.createElement('td');
                ocrCell.className = 'py-3 px-4 max-w-xs';
                const rawTextPreview = (tx.rawOcrText || '').replace(/\s+/g, ' ').trim();
                if (rawTextPreview) {
                    const preview = document.createElement('div');
                    preview.className = 'max-w-[220px] truncate text-xs text-slate-400';
                    preview.textContent = rawTextPreview;
                    preview.title = rawTextPreview;
                    ocrCell.appendChild(preview);
                    const detailsButton = document.createElement('button');
                    detailsButton.className = 'mt-1 text-xs text-blue-400 hover:text-blue-300';
                    detailsButton.textContent = tx.hasReceiptPhoto ? 'View text & photo' : 'View text';
                    detailsButton.addEventListener('click', () => openReceiptDetails(tx));
                    ocrCell.appendChild(detailsButton);
                } else {
                    ocrCell.textContent = '—';
                    ocrCell.className += ' text-slate-500';
                }
                tr.appendChild(ocrCell);
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
            const text = document.getElementById('receiptDialogText');
            const manualDetails = document.getElementById('receiptDialogManualDetails');
            const image = document.getElementById('receiptDialogImage');
            const noImageMessage = document.getElementById('receiptDialogNoImage');
            text.textContent = transaction.rawOcrText || 'No OCR text was saved for this entry.';
            manualDetails.textContent = transaction.manualDetails || 'No manual details were entered for this entry.';
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

        // FINANCIAL STATEMENTS CALCULATOR
        function calculateAndRenderFS() {
            const sym = currencySymbols[orgState.currency];
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
        function loadOcrPreset(key) {
            const preset = ocrPresets[key];
            if(!preset) return;
            activeOcrPreset = { ...preset, isSample: true };
            pendingOcrAttachment = null;

            document.getElementById('ocrUploadPrompt').classList.add('hidden');
            document.getElementById('ocrPreviewContainer').classList.remove('hidden');
            document.getElementById('ocrImgPreview').src = preset.imgSrc;

            clearOcrFields();

            document.getElementById('ocrStatusBadge').textContent = 'Image Ready for Scan';
            document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400';

            document.getElementById('ocrScanBtn').disabled = false;
            document.getElementById('ocrPostBtn').disabled = true;
            document.getElementById('ocrBoxOverlays').innerHTML = '';
        }

        function clearOcrFields() {
            document.getElementById('ocrVendor').value = '';
            document.getElementById('ocrDate').value = '';
            document.getElementById('ocrAmount').value = '';
            document.getElementById('ocrSubCat').value = 'Program Expenses';
            document.getElementById('ocrRawText').value = '';
            document.getElementById('ocrPostBtn').disabled = true;
        }

        function handleImageFile(e) {
            const input = e.target;
            const file = input.files[0];
            if(!file) return;
            input.value = '';
            pendingOcrAttachment = null;
            activeOcrPreset = null;
            clearOcrFields();
            document.getElementById('ocrScanBtn').disabled = true;

            if (!file.type.startsWith('image/')) {
                document.getElementById('ocrStatusBadge').textContent = 'Please choose an image file';
                document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                if(typeof evt.target.result !== 'string') {
                    document.getElementById('ocrStatusBadge').textContent = 'Could not load image';
                    document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                    return;
                }

                activeOcrPreset = { imgSrc: evt.target.result, isSample: false };

                document.getElementById('ocrUploadPrompt').classList.add('hidden');
                document.getElementById('ocrPreviewContainer').classList.remove('hidden');
                document.getElementById('ocrImgPreview').src = evt.target.result;
                clearOcrFields();
                document.getElementById('ocrStatusBadge').textContent = 'Image Ready for Scan';
                document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400';
                document.getElementById('ocrBoxOverlays').innerHTML = '';

                document.getElementById('ocrScanBtn').disabled = false;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.onerror = function() {
                activeOcrPreset = null;
                document.getElementById('ocrStatusBadge').textContent = 'Could not load image';
                document.getElementById('ocrStatusBadge').className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                document.getElementById('ocrScanBtn').disabled = true;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.readAsDataURL(file);
        }

        function renderOcrWordBoxes(words) {
            const image = document.getElementById('ocrImgPreview');
            const overlay = document.getElementById('ocrBoxOverlays');
            if (!image.naturalWidth || !image.naturalHeight) return;

            const imageRect = image.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();
            if (!overlayRect.width || !overlayRect.height) return;
            const scaleX = imageRect.width / image.naturalWidth;
            const scaleY = imageRect.height / image.naturalHeight;
            words.filter(word => word.text.trim() && word.confidence >= 45 && word.bbox).forEach(word => {
                const box = document.createElement('div');
                box.className = 'ocr-box';
                box.style.left = `${((imageRect.left - overlayRect.left + word.bbox.x0 * scaleX) / overlayRect.width) * 100}%`;
                box.style.top = `${((imageRect.top - overlayRect.top + word.bbox.y0 * scaleY) / overlayRect.height) * 100}%`;
                box.style.width = `${((word.bbox.x1 - word.bbox.x0) * scaleX / overlayRect.width) * 100}%`;
                box.style.height = `${((word.bbox.y1 - word.bbox.y0) * scaleY / overlayRect.height) * 100}%`;
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
            const lowerText = receiptText.toLowerCase();
            let subCategory = 'Program Expenses';
            if (/\b(taxi|transport|fare|bus|airline|flight|fuel|gasoline|parking)\b/.test(lowerText)) {
                subCategory = 'Travel & Transportation';
            } else if (/\b(lab|laboratory|research|scientific|hardware|equipment)\b/.test(lowerText)) {
                subCategory = 'Research & Lab Supplies';
            } else if (/\b(catering|venue|gala|event|banquet)\b/.test(lowerText)) {
                subCategory = 'Event Expenses';
            } else if (/\b(office|paper|utility|utilities|electricity|internet|water|supplies)\b/.test(lowerText)) {
                subCategory = 'Office & Admin Expense';
            }

            return {
                vendor,
                date: parseOcrDate(receiptText),
                amount,
                subCategory,
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

        async function runOcrScan() {
            if(!activeOcrPreset) return;

            const scanLaser = document.getElementById('scanLaser');
            const badge = document.getElementById('ocrStatusBadge');
            const overlays = document.getElementById('ocrBoxOverlays');

            if (!activeOcrPreset.isSample && !window.Tesseract) {
                badge.textContent = 'OCR engine unavailable';
                badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                notifyUser('The OCR engine could not be loaded. Check your internet connection and reload the page.');
                return;
            }

            scanLaser.classList.remove('hidden');
            badge.textContent = 'Recognizing receipt text...';
            badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 animate-pulse';
            document.getElementById('ocrScanBtn').disabled = true;
            document.getElementById('ocrPostBtn').disabled = true;
            overlays.innerHTML = '';

            try {
                const recognition = activeOcrPreset.isSample ? null : await window.Tesseract.recognize(activeOcrPreset.imgSrc, 'eng', {
                        logger: progress => {
                            if (progress.status === 'recognizing text' && Number.isFinite(progress.progress)) {
                                badge.textContent = `Recognizing receipt text... ${Math.round(progress.progress * 100)}%`;
                            }
                        }
                    });
                const recognizedText = recognition ? recognition.data.text : activeOcrPreset.rawText;
                const result = parseReceiptText(recognizedText);

                scanLaser.classList.add('hidden');
                if (recognition) renderOcrWordBoxes(recognition.data.words);
                document.getElementById('ocrVendor').value = result.vendor;
                document.getElementById('ocrDate').value = result.date;
                document.getElementById('ocrAmount').value = result.amount;
                document.getElementById('ocrSubCat').value = result.subCategory;
                document.getElementById('ocrRawText').value = result.rawText;

                if (!result.rawText) {
                    badge.textContent = 'No text found; try a clearer image';
                    badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                } else {
                    badge.textContent = 'Text extracted — review fields before posting';
                    badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400';
                    document.getElementById('ocrPostBtn').disabled = false;
                }
            } catch (error) {
                scanLaser.classList.add('hidden');
                badge.textContent = 'Could not scan image';
                badge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400';
                notifyUser(`Could not scan the receipt: ${error.message}`);
            } finally {
                document.getElementById('ocrScanBtn').disabled = false;
            }
        }

        async function postOcrToLedger() {
            if(!activeOcrPreset) return;

            const vendor = document.getElementById('ocrVendor').value.trim();
            const date = document.getElementById('ocrDate').value;
            const amount = Number(document.getElementById('ocrAmount').value);
            const subCategory = document.getElementById('ocrSubCat').value;
            if (!vendor || !date || !Number.isFinite(amount) || amount <= 0) {
                notifyUser('Review the extracted fields and enter a vendor, date, and valid amount before posting.');
                return;
            }

            const postButton = document.getElementById('ocrPostBtn');
            postButton.disabled = true;
            try {
                const receiptImage = activeOcrPreset.isSample ? '' : await prepareReceiptImage(activeOcrPreset.imgSrc);
                pendingOcrAttachment = {
                    rawOcrText: document.getElementById('ocrRawText').value,
                    receiptImage
                };
            } catch (error) {
                notifyUser(error.message);
                return;
            } finally {
                postButton.disabled = false;
            }

            switchTab('ledgerTab');

            document.getElementById('entryDate').value = date;
            document.getElementById('entryCategory').value = 'Expense';
            populateSubCategories();
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
    
