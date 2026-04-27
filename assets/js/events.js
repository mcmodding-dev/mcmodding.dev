(function () {
    'use strict';

    const BASE_URL = 'https://workflow.mcmodding.dev/data';

    const state = {
        activeLoader: 'fabric',
        activeVersion: null,
        branches: {},
        currentData: null,
        lastRun: null,
        searchQuery: '',
        searchDesc: false,
        loading: false
    };

    const dom = {};

    /*Icons (Lucide | MIT) */
    const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    const ICON_EXTERNAL = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    const ICON_RESET = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatDate(raw) {
        if (!raw || raw.length < 8) return '';
        return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
    }

    function semverCompare(a, b) {
        const clean = v => v.replace(/\.x$/i, '').replace(/[^0-9.]/g, '');
        const parts = v => clean(v).split('.').map(n => parseInt(n, 10) || 0);
        const av = parts(a), bv = parts(b);
        for (let i = 0; i < Math.max(av.length, bv.length); i++) {
            const diff = (av[i] || 0) - (bv[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    }

    function buildFabricSnippet(ev) {
        const className = (ev.file || '').replace(/\.java$/i, '');
        const variable = ev.variable || '';
        const funcSig = ev.function || '';

        const paramMatch = funcSig.match(/\(([^)]*)\)/);
        const params = paramMatch ? paramMatch[1].trim() : '';
        const returnType = (funcSig.match(/^(\S+)\s+\w/) || [])[1] || '';
        const body = returnType === 'boolean' ? 'return true;' : '// TODO';

        const lambda = params ? `(${params})` : '()';
        return `${className}.${variable}.register(${lambda} -> {\n\t${body}\n});`;
    }

    function buildForgeSnippet(ev) {
        const eventClass = ev.event || '';
        const segments = eventClass.split('.');
        const stripped = segments.map(s => s.replace(/Event$/, '')).join('');
        const methodName = 'on' + stripped.charAt(0).toUpperCase() + stripped.slice(1);
        return `@SubscribeEvent\npublic static void ${methodName}(${eventClass} e) {\n\t// TODO\n}`;
    }

    function copyToClipboard(btn, text, trackData) {
        navigator.clipboard.writeText(text).then(() => {
            _qa('copy_event', trackData);
            btn.innerHTML = ICON_CHECK;
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = ICON_COPY;
                btn.classList.remove('copied');
            }, 1500);
        }).catch(() => {
            setTimeout(() => { btn.innerHTML = ICON_COPY; }, 1500);
        });
    }

    const STORAGE_KEY = 'mcmodding_events';

    function saveState() {
        try {
            const data = loadSavedState() || {};
            data.loader = state.activeLoader;
            data.searchDesc = state.searchDesc;
            if (!data[state.activeLoader]) data[state.activeLoader] = {};
            data[state.activeLoader].version = state.activeVersion;
            data[state.activeLoader].search = state.searchQuery;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_) {}
    }

    function loadSavedState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        } catch (_) {
            return null;
        }
    }

    async function fetchJson(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
        return resp.json();
    }

    async function loadBranches(loader) {
        if (state.branches[loader]) return state.branches[loader];
        const data = await fetchJson(`${BASE_URL}/${loader}/branches.min.json`);
        const list = Array.isArray(data.branches) ? data.branches : [];
        list.sort((a, b) => semverCompare(b, a));
        state.branches[loader] = list;
        return list;
    }

    async function loadVersion(loader, version) {
        state.loading = true;
        state.activeVersion = version;
        renderLoading();
        dom.versionSelect.disabled = true;

        try {
            const data = await fetchJson(`${BASE_URL}/${loader}/${version}.min.json`);
            state.currentData = data;

            if (loader === 'fabric') {
                renderFabric(data);
            } else {
                renderForge(data, loader);
            }
            if (state.searchQuery) applyFilter(state.searchQuery);
            updateStatusBar();
            saveState();
            const eventCount = dom.content.querySelectorAll('tbody tr').length;
            _qa('data_loaded', { loader, version, count: eventCount });
        } catch (err) {
            renderError(err.message);
        } finally {
            state.loading = false;
            dom.versionSelect.disabled = false;
        }
    }

    async function loadLoader(loader) {
        const loaderSaved = (loadSavedState() || {})[loader] || {};

        state.activeLoader = loader;
        state.currentData = null;
        dom.search.value = '';
        state.searchQuery = '';
        dom.versionSelect.disabled = true;
        dom.versionSelect.innerHTML = '<option value="">Loading...</option>';
        renderLoading();

        try {
            const branches = await loadBranches(loader);
            if (!branches.length) {
                renderError('No versions available for ' + loader + '.');
                dom.versionSelect.innerHTML = '<option value="">No versions</option>';
                return;
            }
            populateVersionDropdown(branches);
            const savedVersion = loaderSaved.version;
            const version = (savedVersion && branches.includes(savedVersion)) ? savedVersion : branches[0];
            dom.versionSelect.value = version;
            await loadVersion(loader, version);

            if (loaderSaved.search) {
                dom.search.value = loaderSaved.search;
                applyFilter(loaderSaved.search);
                saveState();
                dom.filterReset.disabled = false;
            }
        } catch (err) {
            renderError(err.message);
            dom.versionSelect.innerHTML = '<option value="">Error</option>';
        }
    }

    function populateVersionDropdown(branches) {
        dom.versionSelect.innerHTML = branches
            .map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
            .join('');
    }

    function renderLoading() {
        dom.content.innerHTML = '<div class="state-loading">Loading events…</div>';
        dom.status.innerHTML = '<span class="status-spinner"></span>';
    }

    function renderError(msg) {
        dom.content.innerHTML = `
            <div class="state-error">
                <p>Failed to load data.</p>
                <p>${escapeHtml(msg)}</p>
            </div>`;
        dom.status.textContent = '';
    }

    function renderEmpty() {
        dom.content.innerHTML = '<div class="state-empty">No events found for this version.</div>';
        dom.status.textContent = '0 events';
    }

    function buildGroupShell(name, count) {
        const group = document.createElement('div');
        group.className = 'module-group';
        group.dataset.module = name;

        const header = document.createElement('div');
        header.className = 'module-group-header';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', 'true');
        header.innerHTML = `
            <span class="group-name">${escapeHtml(name)}</span>
            <span class="group-right">
                <span class="group-count">${count} events</span>
                <span class="group-chevron">▼</span>
            </span>`;
        header.addEventListener('click', toggleGroup);
        header.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup({ currentTarget: header }); }
        });

        const body = document.createElement('div');
        body.className = 'module-group-body';

        group.appendChild(header);
        group.appendChild(body);
        return { group, body };
    }

    function renderFabric(json) {
        const container = dom.content;
        container.innerHTML = '';

        const modules = Object.entries(json.data || {});
        if (!modules.length) { renderEmpty(); return; }

        modules.forEach(([moduleName, events]) => {
            if (!events || !events.length) return;

            const { group, body } = buildGroupShell(moduleName, events.length);

            const table = document.createElement('table');
            table.className = 'events-table';
            table.innerHTML = `
                <colgroup>
                    <col style="width:32px">
                    <col style="width:18%">
                    <col style="width:16%">
                    <col style="width:16%">
                    <col style="width:18%">
                    <col style="width:auto">
                    <col style="width:80px">
                    <col style="width:80px">
                </colgroup>
                <thead>
                    <tr>
                        <th></th>
                        <th>Class</th>
                        <th>Interface</th>
                        <th>Variable</th>
                        <th>Package</th>
                        <th>Function Signature</th>
                        <th>Source</th>
                        <th>Copy</th>
                    </tr>
                </thead>`;

            const tbody = document.createElement('tbody');

            let rowIndex = 0;
            events.forEach(ev => {
                const tr = document.createElement('tr');
                tr.classList.add(rowIndex % 2 === 0 ? 'ev-row-odd' : 'ev-row-even');
                rowIndex++;

                tr.dataset.search = [
                    moduleName,
                    ev['interface'] || '',
                    ev.variable || '',
                    ev.function || '',
                    ev.package || '',
                    ev.file || ''
                ].join(' ').toLowerCase();
                tr.dataset.desc = (ev.description || '').toLowerCase();

                const badges = [];
                if (ev.deprecated) {
                    badges.push('<span class="ev-badge ev-badge-deprecated">Deprecated</span>');
                }
                if (ev.side) {
                    badges.push(`<span class="ev-badge ev-badge-side ev-badge-side-${escapeHtml(ev.side)}">${escapeHtml(ev.side)}</span>`);
                }
                const badgeHtml = badges.length ? `<span class="ev-badges">${badges.join('')}</span>` : '';

                const className = (ev.file || '').replace(/\.java$/i, '');
                const classDisplay = escapeHtml(className);
                const interfaceDisplay = (ev['interface'] || '') === className ? '″' : escapeHtml(ev['interface'] || '');

                tr.innerHTML = `
                    <td class="col-chevron">${ev.description ? `<span class="ev-expand-icon">${ICON_CHEVRON}</span>` : ''}</td>
                    <td class="col-class">${classDisplay}</td>
                    <td><div class="ev-name-row"><span>${interfaceDisplay}</span>${badgeHtml}</div></td>
                    <td>${escapeHtml(ev.variable || '')}</td>
                    <td class="col-pkg">${escapeHtml(ev.package || '')}</td>
                    <td class="col-func">${escapeHtml(ev.function || '')}</td>
                    <td class="col-link"><a href="${escapeHtml(ev.url || '#')}" target="_blank" rel="noopener noreferrer" title="View source" aria-label="View source">${ICON_EXTERNAL}</a></td>
                    <td class="col-copy"></td>`;

                if (ev.description) {
                    const descTr = document.createElement('tr');
                    descTr.className = 'desc-row desc-row-hidden';
                    descTr.dataset.search = tr.dataset.search;

                    const descEmpty1 = document.createElement('td');
                    const descTd = document.createElement('td');
                    descTd.className = 'col-desc';
                    descTd.colSpan = 6;
                    descTd.textContent = ev.description;
                    const descEmpty2 = document.createElement('td');

                    descTr.appendChild(descEmpty1);
                    descTr.appendChild(descTd);
                    descTr.appendChild(descEmpty2);

                    tr.classList.add('has-desc');
                    tr.addEventListener('click', e => {
                        if (e.target.closest('a, button')) return;
                        const expanded = tr.classList.toggle('row-expanded');
                        descTr.classList.toggle('desc-row-hidden', !expanded);
                    });

                    tbody.appendChild(tr);
                    tbody.appendChild(descTr);
                } else {
                    tbody.appendChild(tr);
                }

                const sourceLink = tr.querySelector('.col-link a');
                if (sourceLink) {
                    sourceLink.addEventListener('click', () => {
                        _qa('source_click', { loader: 'fabric', module: moduleName, event: className + '.' + (ev.variable || '') });
                    });
                }

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.innerHTML = ICON_COPY;
                copyBtn.setAttribute('title', 'Copy code snippet');
                copyBtn.setAttribute('aria-label', 'Copy code snippet');
                copyBtn.addEventListener('click', () => {
                    copyToClipboard(copyBtn, buildFabricSnippet(ev), { loader: 'fabric', module: moduleName, event: className + '.' + (ev.variable || '') });
                });
                tr.querySelector('.col-copy').appendChild(copyBtn);
            });

            table.appendChild(tbody);
            body.appendChild(table);
            dom.content.appendChild(group);
        });

        autoSizeFabricInterfaceCol();
    }

    function autoSizeFabricInterfaceCol() {
        const allTables = dom.content.querySelectorAll('.events-table');
        if (!allTables.length) return;

        const firstTd = dom.content.querySelector('.events-table tbody td:nth-child(2)');
        if (!firstTd) return;
        const cs = getComputedStyle(firstTd);

        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;';
        probe.style.fontSize = cs.fontSize || '0.855rem';
        probe.style.fontFamily = cs.fontFamily || 'system-ui, sans-serif';
        probe.style.fontWeight = cs.fontWeight || '400';
        document.body.appendChild(probe);

        let maxClassPx = 0;
        dom.content.querySelectorAll('.events-table tbody td:nth-child(2)').forEach(td => {
            probe.textContent = td.textContent.trim();
            maxClassPx = Math.max(maxClassPx, probe.getBoundingClientRect().width);
        });

        let maxInterfacePx = 0;
        dom.content.querySelectorAll('.events-table tbody td:nth-child(3)').forEach(td => {
            const text = td.textContent.trim();
            if (text === '″') return;
            probe.textContent = text;
            maxInterfacePx = Math.max(maxInterfacePx, probe.getBoundingClientRect().width);
        });
        probe.remove();

        if (!maxClassPx && !maxInterfacePx) return;

        const tdPadding = 24;
        const tableWidth = allTables[0].offsetWidth;
        if (!tableWidth) return;

        const classPct = Math.max(14, Math.ceil(((maxClassPx * 1.1 + tdPadding + 10) / tableWidth) * 100));
        const interfacePct = Math.max(14, Math.ceil(((maxInterfacePx * 1.07 + tdPadding) / tableWidth) * 100));

        const fixedPx = 192;
        const flexPoolPct = Math.floor((tableWidth - fixedPx) / tableWidth * 100);
        const flexRemaining = flexPoolPct - classPct - interfacePct;
        if (flexRemaining < 20) return;

        const funcBase = flexPoolPct - 55;
        const parts = 16 + 19 + funcBase;
        const varPct = Math.round((16 / parts) * flexRemaining);
        const pkgPct = Math.round((19 / parts) * flexRemaining);
        const funcPct = flexRemaining - varPct - pkgPct;

        allTables.forEach(table => {
            const cols = table.querySelectorAll('col');
            if (cols.length >= 6) {
                cols[1].style.width = classPct + '%';
                cols[2].style.width = interfacePct + '%';
                cols[3].style.width = varPct + '%';
                cols[4].style.width = pkgPct + '%';
                cols[5].style.width = funcPct + '%';
            }
        });
    }

    function renderForge(json, loader) {
        const container = dom.content;
        container.innerHTML = '';

        const packages = Object.entries(json.data || {});
        if (!packages.length) { renderEmpty(); return; }

        packages.forEach(([packageName, events]) => {
            if (!events || !events.length) return;

            const { group, body } = buildGroupShell(packageName, events.length);

            const table = document.createElement('table');
            table.className = 'events-table';
            table.innerHTML = `
                <colgroup>
                    <col style="width:32px">
                    <col style="width:480px">
                    <col style="width:auto">
                    <col style="width:80px">
                    <col style="width:80px">
                </colgroup>
                <thead>
                    <tr>
                        <th></th>
                        <th>Event</th>
                        <th>Fields</th>
                        <th>Source</th>
                        <th>Copy</th>
                    </tr>
                </thead>`;

            const tbody = document.createElement('tbody');

            let rowIndex = 0;
            events.forEach(ev => {
                const tr = document.createElement('tr');
                tr.classList.add(rowIndex % 2 === 0 ? 'ev-row-odd' : 'ev-row-even');
                rowIndex++;

                const fieldSearch = ev.fields ? ev.fields.map(f => f.name + ' ' + f.type).join(' ') : '';
                tr.dataset.search = [packageName, ev.event || '', fieldSearch].join(' ').toLowerCase();
                tr.dataset.desc = (ev.description || '').toLowerCase();

                const badges = [];
                if (ev.cancellable) {
                    badges.push('<span class="ev-badge ev-badge-cancel">Cancellable</span>');
                }
                if (ev.hasResult) {
                    badges.push('<span class="ev-badge ev-badge-result">HasResult</span>');
                }
                if (ev.side) {
                    badges.push(`<span class="ev-badge ev-badge-side ev-badge-side-${escapeHtml(ev.side)}">${escapeHtml(ev.side)}</span>`);
                }
                const badgeHtml = badges.length ? `<span class="ev-badges">${badges.join('')}</span>` : '';

                let fieldsTd = '<td class="col-fields">';
                let visibleFieldCount = 0;
                if (ev.fields && ev.fields.length) {
                    let fieldCharCount = 0;
                    const FIELD_CHAR_LIMIT = 60;
                    ev.fields.forEach((f, i) => {
                        const len = f.type.length + f.name.length;
                        const hidden = i > 0 && fieldCharCount + len > FIELD_CHAR_LIMIT;
                        if (!hidden) {
                            fieldCharCount += len;
                            visibleFieldCount++;
                        }
                        const cls = hidden ? ' ev-field-hidden' : '';
                        fieldsTd += `<div class="ev-field${cls}"><span class="ev-field-type">${escapeHtml(f.type)}</span><span class="ev-field-name">${escapeHtml(f.name)}</span></div>`;
                    });
                    if (ev.fields.length > visibleFieldCount) {
                        fieldsTd += `<div class="ev-fields-more">+${ev.fields.length - visibleFieldCount} more</div>`;
                    }
                }
                fieldsTd += '</td>';

                const hasContent = !!(ev.description || (ev.fields && ev.fields.length > visibleFieldCount));

                tr.innerHTML = `
                    <td class="col-chevron">${hasContent ? `<span class="ev-expand-icon">${ICON_CHEVRON}</span>` : ''}</td>
                    <td><div class="ev-name-row"><span class="ev-name">${escapeHtml(ev.event || '')}</span>${badgeHtml}</div></td>
                    ${fieldsTd}
                    <td class="col-link"><a href="${escapeHtml(ev.url || '#')}" target="_blank" rel="noopener noreferrer" title="View source" aria-label="View source">${ICON_EXTERNAL}</a></td>
                    <td class="col-copy"></td>`;

                if (ev.description) {
                    const descTr = document.createElement('tr');
                    descTr.className = 'desc-row desc-row-hidden';
                    descTr.dataset.search = tr.dataset.search;

                    const descEmpty1 = document.createElement('td');
                    const descTd = document.createElement('td');
                    descTd.className = 'col-desc';
                    descTd.colSpan = 2;
                    descTd.textContent = ev.description;
                    const descEmpty2 = document.createElement('td');
                    const descEmpty3 = document.createElement('td');

                    descTr.appendChild(descEmpty1);
                    descTr.appendChild(descTd);
                    descTr.appendChild(descEmpty2);
                    descTr.appendChild(descEmpty3);

                    tr.classList.add('has-desc');
                    tr.addEventListener('click', e => {
                        if (e.target.closest('a, button')) return;
                        const expanded = tr.classList.toggle('row-expanded');
                        descTr.classList.toggle('desc-row-hidden', !expanded);
                    });

                    tbody.appendChild(tr);
                    tbody.appendChild(descTr);
                } else if (hasContent) {
                    tr.classList.add('has-desc');
                    tr.addEventListener('click', e => {
                        if (e.target.closest('a, button')) return;
                        tr.classList.toggle('row-expanded');
                    });
                    tbody.appendChild(tr);
                } else {
                    tbody.appendChild(tr);
                }

                const sourceLink = tr.querySelector('.col-link a');
                if (sourceLink) {
                    sourceLink.addEventListener('click', () => {
                        _qa('source_click', { loader: loader, event: ev.event || '' });
                    });
                }

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.innerHTML = ICON_COPY;
                copyBtn.setAttribute('title', 'Copy code snippet');
                copyBtn.setAttribute('aria-label', 'Copy code snippet');
                copyBtn.addEventListener('click', () => {
                    copyToClipboard(copyBtn, buildForgeSnippet(ev), { loader: loader, event: ev.event || '' });
                });
                tr.querySelector('.col-copy').appendChild(copyBtn);
            });

            table.appendChild(tbody);
            body.appendChild(table);
            dom.content.appendChild(group);
        });
    }

    function applyFilter(query) {
        state.searchQuery = query.trim().toLowerCase();
        const groups = dom.content.querySelectorAll('.module-group');

        let totalVisible = 0;

        groups.forEach(group => {
            const rows = group.querySelectorAll('tbody tr:not(.desc-row)');
            let visible = 0;

            rows.forEach(tr => {
                let haystack = tr.dataset.search || '';
                if (state.searchDesc && tr.dataset.desc) haystack += ' ' + tr.dataset.desc;
                const match = !state.searchQuery || haystack.includes(state.searchQuery);
                tr.classList.toggle('row-hidden', !match);
                const descTr = tr.nextElementSibling;
                if (descTr && descTr.classList.contains('desc-row')) {
                    descTr.classList.toggle('row-hidden', !match);
                }
                if (match) visible++;
            });

            totalVisible += visible;
            group.classList.toggle('all-hidden', visible === 0);

            const countEl = group.querySelector('.group-count');
            if (countEl) {
                const totalRows = rows.length;
                countEl.textContent = state.searchQuery
                    ? `${visible} / ${totalRows} events`
                    : `${totalRows} events`;
            }
        });

        if (state.searchQuery && totalVisible === 0) {
            _qa('search_no_results', { loader: state.activeLoader, version: state.activeVersion, query: state.searchQuery });
        }

        updateStatusBar();
    }

    function updateStatusBar() {
        const total = dom.content.querySelectorAll('tbody tr:not(.desc-row)').length;
        const visible = dom.content.querySelectorAll('tbody tr:not(.desc-row):not(.row-hidden)').length;
        const json = state.currentData;

        let datePart = '';
        if (json) {
            const commitDate = json.commit_date ? formatDate(json.commit_date) : '';
            if (commitDate) datePart += ' · Commit date: ' + commitDate;
        }
        if (state.lastRun) datePart += ' · Last checked: ' + formatDate(state.lastRun);

        dom.status.textContent = state.searchQuery
            ? `Showing ${visible} of ${total} events${datePart}`
            : `${total} events${datePart}`;
    }

    function updateSearchPlaceholder() {
        dom.search.placeholder = state.searchDesc
            ? 'Search events, fields, packages & descriptions'
            : 'Search events, fields & packages';
    }

    function toggleGroup(e) {
        const header = e.currentTarget;
        const group = header.closest('.module-group');
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!expanded));
        group.classList.toggle('collapsed', expanded);
        _qa('toggle_group', { loader: state.activeLoader, group: group.dataset.module || '', action: expanded ? 'collapse' : 'expand' });
    }

    function bindEvents() {
        dom.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.loader === state.activeLoader && state.currentData) return;
                dom.tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                _qa('change_loader', { loader: btn.dataset.loader });
                loadLoader(btn.dataset.loader);
            });
        });

        dom.versionSelect.addEventListener('change', e => {
            if (e.target.value) {
                _qa('change_version', { loader: state.activeLoader, version: e.target.value });
                loadVersion(state.activeLoader, e.target.value);
            }
        });

        dom.filterReset.addEventListener('click', () => {
            dom.search.value = '';
            applyFilter('');
            saveState();
            dom.filterReset.disabled = true;
        });

        let searchTimer = null;
        dom.search.addEventListener('input', e => {
            clearTimeout(searchTimer);
            dom.filterReset.disabled = !e.target.value;
            searchTimer = setTimeout(() => {
                applyFilter(e.target.value);
                saveState();
                if (e.target.value.trim()) {
                    _qa('search', { loader: state.activeLoader, version: state.activeVersion, query: e.target.value.trim() });
                }
            }, 200);
        });

        dom.descToggle.addEventListener('change', () => {
            state.searchDesc = dom.descToggle.checked;
            updateSearchPlaceholder();
            applyFilter(state.searchQuery);
            saveState();
        });
    }

    async function init() {
        dom.tabBtns = document.querySelectorAll('.tab-btn');
        dom.versionSelect = document.getElementById('version-select');
        dom.search = document.getElementById('search-input');
        dom.filterReset = document.getElementById('filter-reset');
        dom.filterReset.innerHTML = ICON_RESET;
        dom.content = document.getElementById('events-content');
        dom.status = document.getElementById('events-status');
        dom.descToggle = document.getElementById('search-desc-toggle');

        const saved = loadSavedState();
        state.searchDesc = !!(saved && saved.searchDesc);
        dom.descToggle.checked = state.searchDesc;
        updateSearchPlaceholder();

        fetchJson(`${BASE_URL}/script/run.json`)
            .then(d => { if (d && d.last_run) state.lastRun = d.last_run; })
            .catch(() => {});

        bindEvents();

        const loader = (saved && saved.loader) || 'fabric';

        dom.tabBtns.forEach(b => {
            const active = b.dataset.loader === loader;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', String(active));
        });

        await loadLoader(loader);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
