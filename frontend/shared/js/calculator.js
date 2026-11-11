/**
 * UrbanScope Interactive Monthly Amortization & Affordability Calculator
 * 
 * Provides financial calculations for Philippine real estate transactions:
 * - Standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * - Gross Monthly Income (GMI) qualification threshold (35% debt-to-income rule)
 * - Downpayment installment equity schedules (12, 18, 24 months)
 * - Benchmark financing rates: Bank (7.0% indicative) & Pag-IBIG Fund (6.25% indicative)
 * - 1-Click Inquiry intent transfer to inquiry.html
 */

(function (root) {
    'use strict';

    var UrbanCalculator = {
        // Benchmark interest rates
        RATES: {
            bank: 7.0,      // 7.0% p.a. Bank financing indicative rate (1-5 yr repricing)
            pagibig: 6.25   // 6.25% p.a. Pag-IBIG Fund 3-year fixed indicative rate
        },

        // Philippine lending benchmark: Max 35% of Gross Monthly Income
        MAX_DTI_RATIO: 0.35,

        /**
         * Formats a numeric value into Philippine Peso string (e.g. ₱38,454)
         */
        formatPeso: function (amount) {
            if (isNaN(amount) || amount === null || amount === undefined) return '₱0';
            var rounded = Math.round(amount);
            return '₱' + rounded.toLocaleString('en-PH');
        },

        /**
         * Computes monthly amortization, DP equity breakdown, and required income
         */
        computeAmortization: function (params) {
            var tcp = Math.max(0, Number(params.tcp) || 0);
            var dpPercent = Number(params.dpPercent) || 20;
            if (dpPercent > 1) dpPercent = dpPercent / 100; // normalize 20 -> 0.20

            var reservationFee = Math.max(0, Number(params.reservationFee) || 0);
            var dpMonths = Math.max(1, Number(params.dpMonths) || 12);
            var loanTermYears = Math.max(1, Number(params.loanTermYears) || 20);
            var annualRatePercent = Number(params.interestRateAnnual);
            if (isNaN(annualRatePercent) || annualRatePercent <= 0) {
                annualRatePercent = 7.0;
            }

            // Downpayment figures
            var dpAmount = tcp * dpPercent;
            var netDp = Math.max(0, dpAmount - reservationFee);
            var monthlyDp = dpMonths > 0 ? (netDp / dpMonths) : 0;

            // Loanable balance
            var loanableAmount = Math.max(0, tcp - dpAmount);

            // Loan Amortization formula
            var r = (annualRatePercent / 100) / 12; // monthly interest rate
            var n = loanTermYears * 12;            // total monthly periods
            var monthlyAmortization = 0;

            if (loanableAmount > 0) {
                if (r > 0) {
                    var factor = Math.pow(1 + r, n);
                    monthlyAmortization = loanableAmount * ((r * factor) / (factor - 1));
                } else {
                    monthlyAmortization = loanableAmount / n;
                }
            }

            // Required Gross Monthly Income (35% ceiling)
            var requiredGmi = monthlyAmortization > 0 ? (monthlyAmortization / UrbanCalculator.MAX_DTI_RATIO) : 0;

            return {
                tcp: tcp,
                dpPercent: Math.round(dpPercent * 100),
                dpAmount: Math.round(dpAmount),
                reservationFee: Math.round(reservationFee),
                netDp: Math.round(netDp),
                dpMonths: dpMonths,
                monthlyDp: Math.round(monthlyDp),
                loanableAmount: Math.round(loanableAmount),
                loanTermYears: loanTermYears,
                interestRateAnnual: annualRatePercent,
                monthlyAmortization: Math.round(monthlyAmortization),
                requiredGmi: Math.round(requiredGmi)
            };
        },

        /**
         * Calculates affordable home price based on user's monthly household income
         */
        computeAffordabilityFromSalary: function (monthlySalary, loanTermYears, annualRatePercent, dpPercent) {
            var salary = Math.max(0, Number(monthlySalary) || 0);
            var termYears = Math.max(1, Number(loanTermYears) || 20);
            var rate = Number(annualRatePercent) || UrbanCalculator.RATES.bank;
            var dpRate = (Number(dpPercent) || 20);
            if (dpRate > 1) dpRate = dpRate / 100;

            var maxMonthlyAmort = salary * UrbanCalculator.MAX_DTI_RATIO;
            var r = (rate / 100) / 12;
            var n = termYears * 12;
            var loanable = 0;

            if (r > 0 && maxMonthlyAmort > 0) {
                var factor = Math.pow(1 + r, n);
                loanable = maxMonthlyAmort * ((factor - 1) / (r * factor));
            }

            var estimatedTcp = (1 - dpRate) > 0 ? (loanable / (1 - dpRate)) : loanable;

            return {
                monthlySalary: Math.round(salary),
                maxMonthlyAmort: Math.round(maxMonthlyAmort),
                loanable: Math.round(loanable),
                estimatedTcp: Math.round(estimatedTcp),
                loanTermYears: termYears,
                interestRateAnnual: rate,
                dpPercent: Math.round(dpRate * 100)
            };
        },

        /**
         * Persists calculation intent and returns the deep-link URL to inquiry form
         */
        saveCalculationIntent: function (data) {
            try {
                sessionStorage.setItem('urbanscope_calc_intent', JSON.stringify(data));
            } catch (e) { }

            var isPagesSubdir = window.location.pathname.toLowerCase().indexOf('/pages/') !== -1;
            var basePath = isPagesSubdir ? '../inquiry/inquiry.html' : 'pages/inquiry/inquiry.html';

            var queryParams = [];
            queryParams.push('type=property');
            if (data.propertyId) queryParams.push('id=' + encodeURIComponent(data.propertyId));
            if (data.propertyTitle) queryParams.push('title=' + encodeURIComponent(data.propertyTitle));
            queryParams.push('calc=1');

            return basePath + '?' + queryParams.join('&');
        },

        /**
         * Mounts and initializes the Interactive Calculator on a property page
         */
        initPropertyCalculator: function (containerOrId, options) {
            var container = typeof containerOrId === 'string'
                ? document.getElementById(containerOrId)
                : containerOrId;
            if (!container) return;

            var config = Object.assign({
                tcp: 6200000,
                propertyTitle: 'Kathleen',
                propertyId: '',
                reservationFee: 50000,
                defaultDpPercent: 20,
                defaultTermYears: 20,
                defaultFinancing: 'bank', // 'bank' or 'pagibig'
                defaultDpMonths: 12,
                supportedFinancing: ['bank', 'pagibig']
            }, options || {});

            var state = {
                tcp: Number(config.tcp) || 6200000,
                financing: config.defaultFinancing,
                dpPercent: Number(config.defaultDpPercent) || 20,
                termYears: Number(config.defaultTermYears) || 20,
                dpMonths: Number(config.defaultDpMonths) || 12,
                reservationFee: Number(config.reservationFee) || 0
            };

            // Build DOM structure
            container.innerHTML = [
                '<div class="calc-card">',
                '  <div class="calc-header">',
                '    <div class="calc-header-title">',
                '      <div class="calc-header-icon" aria-hidden="true">',
                '        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
                '          <rect x="4" y="2" width="16" height="20" rx="2"></rect>',
                '          <line x1="8" y1="6" x2="16" y2="6"></line>',
                '          <line x1="16" y1="14" x2="16" y2="18"></line>',
                '          <path d="M16 10h.01"></path>',
                '          <path d="M12 10h.01"></path>',
                '          <path d="M8 10h.01"></path>',
                '          <path d="M12 14h.01"></path>',
                '          <path d="M8 14h.01"></path>',
                '          <path d="M12 18h.01"></path>',
                '          <path d="M8 18h.01"></path>',
                '        </svg>',
                '      </div>',
                '      <div>',
                '        <h3>Monthly Amortization &amp; Affordability Calculator</h3>',
                '        <p>Simulate downpayment terms, monthly loan amortization, and required household income.</p>',
                '      </div>',
                '    </div>',
                '    <div class="calc-tcp-badge">',
                '      <span class="calc-tcp-label">Total Contract Price (TCP)</span>',
                '      <strong class="calc-tcp-val" id="calcTcpVal">' + UrbanCalculator.formatPeso(state.tcp) + '</strong>',
                '    </div>',
                '  </div>',

                '  <div class="calc-body">',
                '    <!-- Left Controls Column -->',
                '    <div class="calc-controls">',
                '      <!-- Financing Mode -->',
                '      <div class="calc-group">',
                '        <label class="calc-label">Financing Program</label>',
                '        <div class="calc-pills" id="calcFinancingPills">',
                (config.supportedFinancing.indexOf('bank') !== -1 ?
                    '          <button type="button" class="calc-pill ' + (state.financing === 'bank' ? 'active' : '') + '" data-financing="bank">' +
                    '            <span class="calc-pill-name">Bank Financing</span>' +
                    '            <span class="calc-pill-rate">7.0% Indicative</span>' +
                    '          </button>' : ''),
                (config.supportedFinancing.indexOf('pagibig') !== -1 ?
                    '          <button type="button" class="calc-pill ' + (state.financing === 'pagibig' ? 'active' : '') + '" data-financing="pagibig">' +
                    '            <span class="calc-pill-name">Pag-IBIG Fund</span>' +
                    '            <span class="calc-pill-rate">6.25% Indicative</span>' +
                    '          </button>' : ''),
                '        </div>',
                '      </div>',

                '      <!-- Downpayment Percentage -->',
                '      <div class="calc-group">',
                '        <div class="calc-group-header">',
                '          <label class="calc-label">Downpayment (Equity)</label>',
                '          <span class="calc-highlight-text" id="calcDpAmountText">₱0 (20%)</span>',
                '        </div>',
                '        <div class="calc-pills calc-pills-dp" id="calcDpPills">',
                '          <button type="button" class="calc-pill ' + (state.dpPercent === 10 ? 'active' : '') + '" data-dp="10">10%</button>',
                '          <button type="button" class="calc-pill ' + (state.dpPercent === 15 ? 'active' : '') + '" data-dp="15">15%</button>',
                '          <button type="button" class="calc-pill ' + (state.dpPercent === 20 ? 'active' : '') + '" data-dp="20">20%</button>',
                '          <button type="button" class="calc-pill ' + (state.dpPercent === 30 ? 'active' : '') + '" data-dp="30">30%</button>',
                '        </div>',
                '      </div>',

                '      <!-- DP Installment Term -->',
                '      <div class="calc-group">',
                '        <div class="calc-group-header">',
                '          <label class="calc-label">Downpayment Installment Schedule</label>',
                '          <span class="calc-sub-note" id="calcResvNote">Net of ₱' + (state.reservationFee).toLocaleString('en-PH') + ' Reservation</span>',
                '        </div>',
                '        <div class="calc-pills calc-pills-months" id="calcMonthsPills">',
                '          <button type="button" class="calc-pill ' + (state.dpMonths === 12 ? 'active' : '') + '" data-months="12">12 Mos</button>',
                '          <button type="button" class="calc-pill ' + (state.dpMonths === 18 ? 'active' : '') + '" data-months="18">18 Mos</button>',
                '          <button type="button" class="calc-pill ' + (state.dpMonths === 24 ? 'active' : '') + '" data-months="24">24 Mos</button>',
                '        </div>',
                '      </div>',

                '      <!-- Loan Term Slider -->',
                '      <div class="calc-group">',
                '        <div class="calc-group-header">',
                '          <label class="calc-label" for="calcTermSlider">Loan Repayment Term</label>',
                '          <span class="calc-highlight-text" id="calcTermText">' + state.termYears + ' Years (' + (state.termYears * 12) + ' Mos)</span>',
                '        </div>',
                '        <div class="calc-slider-wrap">',
                '          <input type="range" id="calcTermSlider" class="calc-slider" min="5" max="30" step="5" value="' + state.termYears + '">',
                '          <div class="calc-slider-ticks">',
                '            <span>5 yrs</span>',
                '            <span>10 yrs</span>',
                '            <span>15 yrs</span>',
                '            <span>20 yrs</span>',
                '            <span>25 yrs</span>',
                '            <span>30 yrs</span>',
                '          </div>',
                '        </div>',
                '      </div>',
                '    </div>',

                '    <!-- Right KPI Results Column -->',
                '    <div class="calc-results-box">',
                '      <div class="calc-kpi-featured">',
                '        <span class="calc-kpi-tag">Estimated Monthly Amortization</span>',
                '        <div class="calc-kpi-main-val" id="calcMonthlyAmortVal">₱0</div>',
                '        <span class="calc-kpi-sub" id="calcAmortSubText">Loan balance computed over ' + state.termYears + ' years</span>',
                '      </div>',

                '      <div class="calc-kpi-grid">',
                '        <div class="calc-kpi-card">',
                '          <span class="calc-kpi-lbl">Required Monthly Income</span>',
                '          <strong class="calc-kpi-val" id="calcGmiVal">₱0</strong>',
                '          <small class="calc-kpi-hint">35% Gross Monthly Income ceiling</small>',
                '        </div>',
                '        <div class="calc-kpi-card">',
                '          <span class="calc-kpi-lbl">Monthly Downpayment</span>',
                '          <strong class="calc-kpi-val" id="calcMonthlyDpVal">₱0</strong>',
                '          <small class="calc-kpi-hint" id="calcMonthlyDpHint">Payable for ' + state.dpMonths + ' months</small>',
                '        </div>',
                '        <div class="calc-kpi-card">',
                '          <span class="calc-kpi-lbl">Estimated Loan Balance</span>',
                '          <strong class="calc-kpi-val" id="calcLoanableVal">₱0</strong>',
                '          <small class="calc-kpi-hint" id="calcLoanableHint">Principal for financing</small>',
                '        </div>',
                '        <div class="calc-kpi-card">',
                '          <span class="calc-kpi-lbl">Reservation Fee</span>',
                '          <strong class="calc-kpi-val">' + UrbanCalculator.formatPeso(state.reservationFee) + '</strong>',
                '          <small class="calc-kpi-hint">Deductible from downpayment</small>',
                '        </div>',
                '      </div>',

                '      <div class="calc-eligibility-tip">',
                '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
                '        <span><strong>Co-borrowers eligible:</strong> Combined spouse, parent, child, or sibling income may be pooled to satisfy required income.</span>',
                '      </div>',

                '      <button type="button" class="calc-inquire-btn" id="calcInquireBtn">',
                '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
                '        <span>Inquire with This Calculation</span>',
                '      </button>',
                '    </div>',
                '  </div>',

                '  <div class="calc-footer-note">',
                '    <p>*Indicative computation for estimate purposes only. All calculations exclude official developer transfer charges, documentary stamp taxes, bank appraisal fees, MRI/Fire insurances, and are subject to final developer and lending institution credit assessment.</p>',
                '  </div>',
                '</div>'
            ].join('\n');

            // DOM elements
            var elTcpVal = container.querySelector('#calcTcpVal');
            var elDpAmountText = container.querySelector('#calcDpAmountText');
            var elMonthsPills = container.querySelector('#calcMonthsPills');
            var elDpPills = container.querySelector('#calcDpPills');
            var elFinancingPills = container.querySelector('#calcFinancingPills');
            var elTermSlider = container.querySelector('#calcTermSlider');
            var elTermText = container.querySelector('#calcTermText');
            var elMonthlyAmortVal = container.querySelector('#calcMonthlyAmortVal');
            var elAmortSubText = container.querySelector('#calcAmortSubText');
            var elGmiVal = container.querySelector('#calcGmiVal');
            var elMonthlyDpVal = container.querySelector('#calcMonthlyDpVal');
            var elMonthlyDpHint = container.querySelector('#calcMonthlyDpHint');
            var elLoanableVal = container.querySelector('#calcLoanableVal');
            var elInquireBtn = container.querySelector('#calcInquireBtn');

            // Refresh calculation results
            function update() {
                var rate = state.financing === 'pagibig' ? UrbanCalculator.RATES.pagibig : UrbanCalculator.RATES.bank;
                var res = UrbanCalculator.computeAmortization({
                    tcp: state.tcp,
                    dpPercent: state.dpPercent,
                    loanTermYears: state.termYears,
                    interestRateAnnual: rate,
                    reservationFee: state.reservationFee,
                    dpMonths: state.dpMonths
                });

                if (elTcpVal) elTcpVal.textContent = UrbanCalculator.formatPeso(res.tcp);
                if (elDpAmountText) elDpAmountText.textContent = UrbanCalculator.formatPeso(res.dpAmount) + ' (' + res.dpPercent + '%)';
                if (elTermText) elTermText.textContent = res.loanTermYears + ' Years (' + (res.loanTermYears * 12) + ' Mos)';
                if (elMonthlyAmortVal) elMonthlyAmortVal.textContent = UrbanCalculator.formatPeso(res.monthlyAmortization) + ' / mo';
                if (elAmortSubText) elAmortSubText.textContent = (state.financing === 'pagibig' ? 'Pag-IBIG @ 6.25%' : 'Bank @ 7.0%') + ' for ' + res.loanTermYears + ' years';
                if (elGmiVal) elGmiVal.textContent = UrbanCalculator.formatPeso(res.requiredGmi) + ' / mo';
                if (elMonthlyDpVal) elMonthlyDpVal.textContent = UrbanCalculator.formatPeso(res.monthlyDp) + ' / mo';
                if (elMonthlyDpHint) elMonthlyDpHint.textContent = 'Payable for ' + res.dpMonths + ' mos (Net of reservation)';
                if (elLoanableVal) elLoanableVal.textContent = UrbanCalculator.formatPeso(res.loanableAmount);
            }

            // Wire Financing Pill Buttons
            if (elFinancingPills) {
                elFinancingPills.addEventListener('click', function (e) {
                    var btn = e.target.closest('.calc-pill');
                    if (!btn) return;
                    var fType = btn.getAttribute('data-financing');
                    if (fType) {
                        state.financing = fType;
                        elFinancingPills.querySelectorAll('.calc-pill').forEach(function (p) {
                            p.classList.toggle('active', p === btn);
                        });
                        update();
                    }
                });
            }

            // Wire DP Percentage Pills
            if (elDpPills) {
                elDpPills.addEventListener('click', function (e) {
                    var btn = e.target.closest('.calc-pill');
                    if (!btn) return;
                    var dp = Number(btn.getAttribute('data-dp'));
                    if (dp) {
                        state.dpPercent = dp;
                        elDpPills.querySelectorAll('.calc-pill').forEach(function (p) {
                            p.classList.toggle('active', p === btn);
                        });
                        update();
                    }
                });
            }

            // Wire DP Months Pills
            if (elMonthsPills) {
                elMonthsPills.addEventListener('click', function (e) {
                    var btn = e.target.closest('.calc-pill');
                    if (!btn) return;
                    var m = Number(btn.getAttribute('data-months'));
                    if (m) {
                        state.dpMonths = m;
                        elMonthsPills.querySelectorAll('.calc-pill').forEach(function (p) {
                            p.classList.toggle('active', p === btn);
                        });
                        update();
                    }
                });
            }

            // Wire Loan Term Slider
            if (elTermSlider) {
                elTermSlider.addEventListener('input', function () {
                    state.termYears = Number(this.value);
                    update();
                });
            }

            // Wire 1-Click Inquire Button
            if (elInquireBtn) {
                elInquireBtn.addEventListener('click', function () {
                    var rate = state.financing === 'pagibig' ? UrbanCalculator.RATES.pagibig : UrbanCalculator.RATES.bank;
                    var res = UrbanCalculator.computeAmortization({
                        tcp: state.tcp,
                        dpPercent: state.dpPercent,
                        loanTermYears: state.termYears,
                        interestRateAnnual: rate,
                        reservationFee: state.reservationFee,
                        dpMonths: state.dpMonths
                    });

                    var intentPayload = {
                        propertyTitle: config.propertyTitle,
                        propertyId: config.propertyId,
                        tcp: res.tcp,
                        financingType: state.financing,
                        financingRate: rate,
                        dpPercent: res.dpPercent,
                        dpAmount: res.dpAmount,
                        dpMonths: res.dpMonths,
                        monthlyDp: res.monthlyDp,
                        reservationFee: res.reservationFee,
                        loanableAmount: res.loanableAmount,
                        loanTermYears: res.loanTermYears,
                        monthlyAmortization: res.monthlyAmortization,
                        requiredGmi: res.requiredGmi,
                        timestamp: new Date().toISOString()
                    };

                    var redirectUrl = UrbanCalculator.saveCalculationIntent(intentPayload);
                    window.location.href = redirectUrl;
                });
            }

            // Public method to update TCP dynamically (e.g. from API/property selector)
            container._setTcp = function (newTcp, newTitle, newId, newResv) {
                if (newTcp) state.tcp = Number(newTcp);
                if (newTitle) config.propertyTitle = newTitle;
                if (newId) config.propertyId = newId;
                if (newResv !== undefined) state.reservationFee = Number(newResv);
                update();
            };

            // Initial calculation run
            update();
            return container;
        },

        /**
         * Mounts the Salary-based Quick Home Affordability Matcher on the homepage
         */
        initHomepageBudgetMatcher: function (containerOrId) {
            var container = typeof containerOrId === 'string'
                ? document.getElementById(containerOrId)
                : containerOrId;
            if (!container) return;

            // Project threshold benchmarks
            var PROJECTS = [
                {
                    id: 'liora',
                    title: 'Liora Homes',
                    location: 'General Trias, Cavite',
                    minPrice: 2460000,
                    minSalary: 42000,
                    financing: 'Pag-IBIG / Bank',
                    image: 'assets/images/Liora.jpg',
                    link: 'pages/properties/Liora.html'
                },
                {
                    id: 'casasuerte',
                    title: 'Casasuerte',
                    location: 'Bacoor, Cavite',
                    minPrice: 2500000,
                    minSalary: 45000,
                    financing: 'Pag-IBIG / Bank',
                    image: 'assets/images/casasuerte.jpg',
                    link: 'pages/properties/casasuerte.html'
                },
                {
                    id: 'kathleen',
                    title: 'Kathleen Place',
                    location: 'Bacoor, Cavite',
                    minPrice: 6200000,
                    minSalary: 105000,
                    financing: 'Bank Financing',
                    image: 'assets/images/kathleen.jpg',
                    link: 'pages/properties/kathleen.html'
                },
                {
                    id: 'airmen',
                    title: "Airmen's Village Triplex",
                    location: 'Cavite & Las Piñas',
                    minPrice: 8900000,
                    minSalary: 155000,
                    financing: 'Bank Financing',
                    image: 'assets/images/Airmen.jpg',
                    link: 'pages/properties/Airmen.html'
                }
            ];

            var defaultSalary = 50000;

            container.innerHTML = [
                '<section class="budget-matcher-section" id="budgetMatcherSection">',
                '  <div class="budget-matcher-container">',
                '    <div class="budget-matcher-header">',
                '      <div class="budget-badge-pill">',
                '        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
                '        <span>Home Affordability Finder</span>',
                '      </div>',
                '      <h2>Find Cavite &amp; Las Piñas Homes Within Your Budget</h2>',
                '      <p>Estimate your home purchasing capacity based on your gross monthly household or co-borrower income.</p>',
                '    </div>',

                '    <div class="budget-matcher-box">',
                '      <!-- Income Slider Column -->',
                '      <div class="budget-input-col">',
                '        <div class="budget-salary-display">',
                '          <span class="budget-salary-lbl">Gross Monthly Household Income</span>',
                '          <div class="budget-salary-val" id="bmSalaryDisplay">₱50,000 / month</div>',
                '          <small class="budget-salary-note">Include combined income of spouse, parent, or co-borrower</small>',
                '        </div>',

                '        <div class="budget-slider-wrap">',
                '          <input type="range" class="calc-slider" id="bmSalarySlider" min="25000" max="200000" step="5000" value="' + defaultSalary + '">',
                '          <div class="budget-slider-labels">',
                '            <span>₱25,000</span>',
                '            <span>₱75,000</span>',
                '            <span>₱125,000</span>',
                '            <span>₱200,000+</span>',
                '          </div>',
                '        </div>',

                '        <div class="budget-metrics-row">',
                '          <div class="budget-metric-card">',
                '            <span class="budget-metric-lbl">Max Comfortable Monthly Amortization</span>',
                '            <strong class="budget-metric-val" id="bmMaxAmort">₱17,500 / mo</strong>',
                '            <small class="budget-metric-hint">Standard 35% GMI ceiling</small>',
                '          </div>',
                '          <div class="budget-metric-card">',
                '            <span class="budget-metric-lbl">Estimated Home Purchasing Power</span>',
                '            <strong class="budget-metric-val" id="bmMaxPrice">₱2,810,000</strong>',
                '            <small class="budget-metric-hint">Based on 20-yr Bank/Pag-IBIG loan</small>',
                '          </div>',
                '        </div>',

                '        <div class="budget-matcher-cta-bar">',
                '          <a href="pages/inquiry/inquiry.html?type=general" class="bm-cta-btn">',
                '            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
                '            <span>Request Pre-Qualification with Miriam</span>',
                '          </a>',
                '        </div>',
                '      </div>',

                '      <!-- Matching Projects Grid Column -->',
                '      <div class="budget-results-col">',
                '        <div class="budget-results-title">',
                '          <h4>Accredited Projects Matching Your Budget</h4>',
                '          <span class="bm-match-count" id="bmMatchCount">2 Homes Available</span>',
                '        </div>',
                '        <div class="bm-projects-list" id="bmProjectsList">',
                '          <!-- Dynamically populated -->',
                '        </div>',
                '      </div>',
                '    </div>',
                '  </div>',
                '</section>'
            ].join('\n');

            var slider = container.querySelector('#bmSalarySlider');
            var display = container.querySelector('#bmSalaryDisplay');
            var elMaxAmort = container.querySelector('#bmMaxAmort');
            var elMaxPrice = container.querySelector('#bmMaxPrice');
            var elCount = container.querySelector('#bmMatchCount');
            var elList = container.querySelector('#bmProjectsList');

            function renderMatches(salary) {
                var res = UrbanCalculator.computeAffordabilityFromSalary(salary, 20, UrbanCalculator.RATES.bank, 20);

                if (display) display.textContent = UrbanCalculator.formatPeso(salary) + ' / month';
                if (elMaxAmort) elMaxAmort.textContent = UrbanCalculator.formatPeso(res.maxMonthlyAmort) + ' / mo';
                if (elMaxPrice) elMaxPrice.textContent = UrbanCalculator.formatPeso(res.estimatedTcp);

                var matchCount = 0;
                var html = '';

                PROJECTS.forEach(function (p) {
                    var qualifies = salary >= p.minSalary;
                    if (qualifies) matchCount++;

                    html += [
                        '<div class="bm-project-item ' + (qualifies ? 'qualified' : 'unqualified') + '">',
                        '  <div class="bm-item-thumb">',
                        '    <img src="' + p.image + '" alt="' + p.title + '" loading="lazy">',
                        '    <span class="bm-item-badge ' + (qualifies ? 'badge-match' : 'badge-gap') + '">',
                        qualifies ? '✓ You Qualify' : 'Needs ₱' + (p.minSalary).toLocaleString('en-PH'),
                        '    </span>',
                        '  </div>',
                        '  <div class="bm-item-info">',
                        '    <h5>' + p.title + '</h5>',
                        '    <p class="bm-item-loc">',
                        '      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
                        p.location,
                        '    </p>',
                        '    <div class="bm-item-pricing">',
                        '      <span>Starts at <strong>' + UrbanCalculator.formatPeso(p.minPrice) + '</strong></span>',
                        '      <small>Financing: ' + p.financing + '</small>',
                        '    </div>',
                        '  </div>',
                        '  <div class="bm-item-act">',
                        '    <a href="' + p.link + '" class="bm-view-btn ' + (qualifies ? 'btn-highlight' : '') + '">View Details</a>',
                        '  </div>',
                        '</div>'
                    ].join('\n');
                });

                if (elCount) elCount.textContent = matchCount + ' of ' + PROJECTS.length + ' Accredited Homes Fit Your Budget';
                if (elList) elList.innerHTML = html;
            }

            if (slider) {
                slider.addEventListener('input', function () {
                    renderMatches(Number(this.value));
                });
            }

            renderMatches(defaultSalary);
        }
    };

    if (root) {
        root.UrbanCalculator = UrbanCalculator;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = UrbanCalculator;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
