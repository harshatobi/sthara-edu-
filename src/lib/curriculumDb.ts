/**
 * curriculumDb.ts
 * Built-in curriculum for Indian school boards and college courses.
 * Used by the Syllabus Planner to auto-populate chapters when a publisher + subject + class is selected.
 *
 * Month distribution follows the Indian academic year: June → March
 * Unit IDs (unit_1 … unit_5) map directly to the assignment unit tagging system.
 */

export interface CurriculumChapter {
  unitId: string;        // "unit_1" … "unit_5"
  topic: string;         // Full chapter/topic name
  month: string;         // Suggested month to teach
  objectives: string;    // Brief learning objective
}

export interface CurriculumEntry {
  description: string;
  chapters: CurriculumChapter[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRICULUM DATABASE
// Key structure: CURRICULUM_DB[publisher_key][subject_key][class_key]
// All keys are lowercase for matching purposes.
// ─────────────────────────────────────────────────────────────────────────────
const CURRICULUM_DB: Record<string, Record<string, Record<string, CurriculumEntry>>> = {

  // ── NCERT / CBSE ──────────────────────────────────────────────────────────
  ncert: {
    mathematics: {
      '10': {
        description: 'NCERT Mathematics Class 10 — Standard curriculum',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Real Numbers', month: 'June', objectives: 'Euclid\'s division lemma, fundamental theorem of arithmetic, irrational numbers and decimal expansions.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Polynomials', month: 'June', objectives: 'Zeros of polynomials, relationship between zeros and coefficients, division algorithm.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Pair of Linear Equations in Two Variables', month: 'July', objectives: 'Graphical and algebraic methods — substitution, elimination, cross-multiplication.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Quadratic Equations', month: 'August', objectives: 'Solution by factorization, completing the square, quadratic formula and discriminant.' },
          { unitId: 'unit_2', topic: 'Chapter 5: Arithmetic Progressions', month: 'August', objectives: 'nth term, sum of first n terms, applications of A.P.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Triangles', month: 'September', objectives: 'Similar triangles, criteria for similarity, Pythagoras theorem and its converse.' },
          { unitId: 'unit_3', topic: 'Chapter 7: Coordinate Geometry', month: 'September', objectives: 'Distance formula, section formula, area of triangle on coordinate plane.' },
          { unitId: 'unit_3', topic: 'Chapter 8: Introduction to Trigonometry', month: 'October', objectives: 'Trigonometric ratios, identities, values of standard angles.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Applications of Trigonometry', month: 'November', objectives: 'Heights and distances, angle of elevation and depression.' },
          { unitId: 'unit_4', topic: 'Chapter 10: Circles', month: 'November', objectives: 'Tangent to a circle, number of tangents from a point, tangent-chord relationships.' },
          { unitId: 'unit_4', topic: 'Chapter 11: Areas Related to Circles', month: 'December', objectives: 'Perimeter and area of a circle, areas of sectors and segments.' },
          { unitId: 'unit_5', topic: 'Chapter 12: Surface Areas and Volumes', month: 'January', objectives: 'Combination of solids, volume and surface area of combined shapes, conversion of solids.' },
          { unitId: 'unit_5', topic: 'Chapter 13: Statistics', month: 'February', objectives: 'Mean, median, mode for grouped data, ogive curve.' },
          { unitId: 'unit_5', topic: 'Chapter 14: Probability', month: 'February', objectives: 'Classical definition, probability of simple events, complementary events.' },
        ],
      },
      '11': {
        description: 'NCERT Mathematics Class 11',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Sets', month: 'June', objectives: 'Set notation, subsets, operations on sets, Venn diagrams.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Relations and Functions', month: 'June', objectives: 'Ordered pairs, Cartesian product, domain and range, function types.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Trigonometric Functions', month: 'July', objectives: 'Radian and degree measure, trigonometric identities, graphs, inverse trig.' },
          { unitId: 'unit_2', topic: 'Chapter 5: Complex Numbers and Quadratic Equations', month: 'August', objectives: 'Algebra of complex numbers, argand plane, quadratic equations in complex domain.' },
          { unitId: 'unit_2', topic: 'Chapter 6: Linear Inequalities', month: 'August', objectives: 'Algebraic and graphical solution of linear inequalities in one and two variables.' },
          { unitId: 'unit_3', topic: 'Chapter 7: Permutations and Combinations', month: 'September', objectives: 'Fundamental principle of counting, permutations, combinations, binomial theorem.' },
          { unitId: 'unit_3', topic: 'Chapter 9: Sequences and Series', month: 'October', objectives: 'A.P., G.P., A.M., G.M., special series: sum of squares and cubes.' },
          { unitId: 'unit_4', topic: 'Chapter 10: Straight Lines', month: 'November', objectives: 'Slope, various forms of equation of a line, distance between lines.' },
          { unitId: 'unit_4', topic: 'Chapter 11: Conic Sections', month: 'December', objectives: 'Circles, parabola, ellipse, hyperbola — standard equations and properties.' },
          { unitId: 'unit_5', topic: 'Chapter 13: Limits and Derivatives', month: 'January', objectives: 'Limit of a function, differentiation, derivatives of polynomial and trigonometric functions.' },
          { unitId: 'unit_5', topic: 'Chapter 15: Statistics', month: 'February', objectives: 'Measures of dispersion: range, mean deviation, variance, standard deviation.' },
          { unitId: 'unit_5', topic: 'Chapter 16: Probability', month: 'March', objectives: 'Random experiments, events, classical definition, axiomatic approach.' },
        ],
      },
      '12': {
        description: 'NCERT Mathematics Class 12',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Relations and Functions', month: 'June', objectives: 'Types of relations and functions, composition, inverse functions.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Inverse Trigonometric Functions', month: 'July', objectives: 'Definition, range, domain, principal value branch, properties and graphs.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Matrices', month: 'July', objectives: 'Types of matrices, operations, transpose, symmetric and skew-symmetric, elementary row operations.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Determinants', month: 'August', objectives: 'Properties, minors, cofactors, adjoint, inverse of a matrix, applications.' },
          { unitId: 'unit_3', topic: 'Chapter 5: Continuity and Differentiability', month: 'September', objectives: 'Continuity, differentiability, chain rule, implicit differentiation, mean value theorem.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Application of Derivatives', month: 'October', objectives: 'Rate of change, tangents, normals, maxima and minima, increasing/decreasing functions.' },
          { unitId: 'unit_4', topic: 'Chapter 7: Integrals', month: 'November', objectives: 'Indefinite integrals, methods of integration, definite integrals, fundamental theorem.' },
          { unitId: 'unit_4', topic: 'Chapter 8: Application of Integrals', month: 'December', objectives: 'Area under a curve, area between curves.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Differential Equations', month: 'December', objectives: 'Order, degree, formation, general and particular solutions, variable separable, linear DEs.' },
          { unitId: 'unit_5', topic: 'Chapter 10: Vector Algebra', month: 'January', objectives: 'Types of vectors, dot product, cross product, scalar triple product.' },
          { unitId: 'unit_5', topic: 'Chapter 11: Three Dimensional Geometry', month: 'January', objectives: 'Direction cosines, equations of lines and planes, distance between skew lines.' },
          { unitId: 'unit_5', topic: 'Chapter 12: Linear Programming', month: 'February', objectives: 'LPP formulation, graphical method, optimal solution, feasible region.' },
          { unitId: 'unit_5', topic: 'Chapter 13: Probability', month: 'February', objectives: 'Conditional probability, Bayes\' theorem, random variables, Binomial distribution.' },
        ],
      },
    },

    accountancy: {
      '11': {
        description: 'NCERT Accountancy Class 11 — Financial Accounting',
        chapters: [
          { unitId: 'unit_1', topic: 'Unit 1: Introduction to Accounting', month: 'June', objectives: 'Meaning, objectives, advantages, limitations, users of accounting information.' },
          { unitId: 'unit_1', topic: 'Unit 2: Theory Base of Accounting', month: 'June', objectives: 'Accounting principles, concepts, conventions, GAAP, accounting standards.' },
          { unitId: 'unit_2', topic: 'Unit 3: Recording of Transactions — I', month: 'July', objectives: 'Source documents, accounting equation, journal, ledger, rules of debit and credit.' },
          { unitId: 'unit_2', topic: 'Unit 4: Recording of Transactions — II', month: 'August', objectives: 'Cash book, petty cash book, other subsidiary books, bank reconciliation statement.' },
          { unitId: 'unit_3', topic: 'Unit 5: Bank Reconciliation Statement', month: 'September', objectives: 'Meaning, need, causes of differences, preparation of BRS.' },
          { unitId: 'unit_3', topic: 'Unit 6: Trial Balance and Rectification of Errors', month: 'October', objectives: 'Preparation of trial balance, types of errors, rectification, suspense account.' },
          { unitId: 'unit_4', topic: 'Unit 7: Depreciation, Provisions and Reserves', month: 'November', objectives: 'Meaning, methods (SLM, WDV), accounting treatment, provisions vs reserves.' },
          { unitId: 'unit_4', topic: 'Unit 8: Bills of Exchange', month: 'December', objectives: 'Meaning, parties, types, journal entries — honour, dishonour, renewal.' },
          { unitId: 'unit_5', topic: 'Unit 9: Financial Statements — I', month: 'January', objectives: 'Trading account, profit & loss account — preparation and significance.' },
          { unitId: 'unit_5', topic: 'Unit 10: Financial Statements — II', month: 'February', objectives: 'Balance sheet, adjustments, marshalling of assets and liabilities.' },
        ],
      },
      '12': {
        description: 'NCERT Accountancy Class 12 — Partnership and Company Accounts',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Accounting for Partnership — Fundamentals', month: 'June', objectives: 'Partnership deed, capital accounts, profit sharing ratio, interest on capital and drawings.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Reconstitution — Admission of a Partner', month: 'July', objectives: 'New profit sharing ratio, sacrificing ratio, goodwill, revaluation, capital adjustment.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Reconstitution — Retirement and Death', month: 'July', objectives: 'Gaining ratio, goodwill, executor\'s account, joint life policy.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Dissolution of Partnership Firm', month: 'August', objectives: 'Modes of dissolution, realization account, settlement of accounts.' },
          { unitId: 'unit_3', topic: 'Chapter 5: Accounting for Share Capital', month: 'September', objectives: 'Types of shares, issue at par/premium/discount, calls in arrears, forfeiture, reissue.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Issue and Redemption of Debentures', month: 'October', objectives: 'Types of debentures, issue, interest, redemption methods — sinking fund, debentures reissued.' },
          { unitId: 'unit_4', topic: 'Chapter 7: Financial Statements of a Company', month: 'November', objectives: 'Balance sheet and Statement of P&L as per Companies Act schedule III.' },
          { unitId: 'unit_4', topic: 'Chapter 8: Analysis of Financial Statements', month: 'December', objectives: 'Objectives, tools: comparative, common size, trend analysis.' },
          { unitId: 'unit_5', topic: 'Chapter 9: Accounting Ratios', month: 'January', objectives: 'Liquidity, solvency, profitability, activity ratios — computation and interpretation.' },
          { unitId: 'unit_5', topic: 'Chapter 10: Cash Flow Statement', month: 'February', objectives: 'Operating, investing, financing activities; indirect method as per AS-3.' },
        ],
      },
    },

    'business studies': {
      '12': {
        description: 'NCERT Business Studies Class 12',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Nature and Significance of Management', month: 'June', objectives: 'Concept, characteristics, objectives, levels, management as science, art and profession.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Principles of Management', month: 'July', objectives: 'Fayol\'s 14 principles, Taylor\'s scientific management techniques.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Business Environment', month: 'July', objectives: 'Dimensions of business environment, SWOT analysis, impact of government policy changes.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Planning', month: 'August', objectives: 'Meaning, importance, limitations, planning process, types of plans.' },
          { unitId: 'unit_2', topic: 'Chapter 5: Organising', month: 'August', objectives: 'Meaning, steps, formal vs informal, span of management, delegation, decentralisation.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Staffing', month: 'September', objectives: 'Staffing process, recruitment, selection, training and development.' },
          { unitId: 'unit_3', topic: 'Chapter 7: Directing', month: 'October', objectives: 'Supervision, motivation theories (Maslow, Herzberg), leadership, communication.' },
          { unitId: 'unit_4', topic: 'Chapter 8: Controlling', month: 'November', objectives: 'Meaning, process, relationship with planning, techniques of managerial control.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Financial Management', month: 'December', objectives: 'Financial planning, capital structure, fixed and working capital, leverage.' },
          { unitId: 'unit_5', topic: 'Chapter 10: Financial Markets', month: 'January', objectives: 'Money market, capital market, NSE, BSE, SEBI, primary and secondary markets.' },
          { unitId: 'unit_5', topic: 'Chapter 11: Marketing Management', month: 'February', objectives: 'Marketing mix (4 Ps), product life cycle, branding, pricing, promotion, distribution.' },
          { unitId: 'unit_5', topic: 'Chapter 12: Consumer Protection', month: 'March', objectives: 'Consumer rights, responsibilities, COPRA, consumer forums, redressal.' },
        ],
      },
    },

    economics: {
      '12': {
        description: 'NCERT Economics Class 12 — Micro and Macro',
        chapters: [
          { unitId: 'unit_1', topic: 'Microeconomics Ch 1: Introduction', month: 'June', objectives: 'Central problems, PPC, opportunity cost, economic systems.' },
          { unitId: 'unit_1', topic: 'Microeconomics Ch 2: Theory of Consumer Behaviour', month: 'June', objectives: 'Utility analysis, budget constraint, consumer equilibrium, demand curve.' },
          { unitId: 'unit_2', topic: 'Microeconomics Ch 3: Production and Costs', month: 'July', objectives: 'Production function, returns to factor, cost concepts — TC, MC, AC.' },
          { unitId: 'unit_2', topic: 'Microeconomics Ch 4: Theory of Firm under Perfect Competition', month: 'August', objectives: 'Revenue, profit maximisation, supply curve, producer surplus.' },
          { unitId: 'unit_3', topic: 'Microeconomics Ch 5: Market Equilibrium', month: 'September', objectives: 'Demand-supply interaction, price determination, shifts and effects.' },
          { unitId: 'unit_3', topic: 'Microeconomics Ch 6: Non-Competitive Markets', month: 'October', objectives: 'Monopoly, monopolistic competition, oligopoly — features and price-output decisions.' },
          { unitId: 'unit_4', topic: 'Macroeconomics Ch 1 & 2: National Income Accounting', month: 'November', objectives: 'GDP, GNP, NNP, NDP — measurement methods, circular flow of income.' },
          { unitId: 'unit_4', topic: 'Macroeconomics Ch 3: Money and Banking', month: 'December', objectives: 'Functions of money, credit creation, central bank functions, RBI, monetary policy.' },
          { unitId: 'unit_5', topic: 'Macroeconomics Ch 4: Income Determination', month: 'January', objectives: 'Aggregate demand, aggregate supply, multiplier effect, investment.' },
          { unitId: 'unit_5', topic: 'Macroeconomics Ch 5: Government Budget', month: 'February', objectives: 'Budget components, types of deficits, fiscal policy, revenue and capital budget.' },
          { unitId: 'unit_5', topic: 'Macroeconomics Ch 6: Balance of Payments', month: 'March', objectives: 'Current and capital account, foreign exchange rate, fixed vs flexible rates.' },
        ],
      },
    },

    physics: {
      '12': {
        description: 'NCERT Physics Class 12',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Electric Charges and Fields', month: 'June', objectives: 'Coulomb\'s law, electric field, Gauss\'s law, field lines, electric flux.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Electrostatic Potential and Capacitance', month: 'July', objectives: 'Electric potential, potential energy, capacitors, dielectrics, energy stored.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Current Electricity', month: 'July', objectives: 'Ohm\'s law, resistance, Kirchhoff\'s laws, Wheatstone bridge, potentiometer.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Moving Charges and Magnetism', month: 'August', objectives: 'Biot-Savart law, Ampere\'s law, force on current-carrying conductor, galvanometer.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Electromagnetic Induction', month: 'September', objectives: 'Faraday\'s law, Lenz\'s law, motional EMF, self and mutual induction.' },
          { unitId: 'unit_3', topic: 'Chapter 7: Alternating Current', month: 'October', objectives: 'AC circuits, phasors, resonance, LC oscillations, power in AC circuits, transformers.' },
          { unitId: 'unit_4', topic: 'Chapter 8: Electromagnetic Waves', month: 'November', objectives: 'Displacement current, EM waves, spectrum, properties of EM waves.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Ray Optics', month: 'November', objectives: 'Reflection, refraction, total internal reflection, lenses, microscopes, telescopes.' },
          { unitId: 'unit_4', topic: 'Chapter 10: Wave Optics', month: 'December', objectives: 'Huygens\' principle, interference, Young\'s experiment, diffraction, polarization.' },
          { unitId: 'unit_5', topic: 'Chapter 12: Atoms', month: 'January', objectives: 'Rutherford model, Bohr model, hydrogen spectrum, de Broglie wavelength.' },
          { unitId: 'unit_5', topic: 'Chapter 13: Nuclei', month: 'January', objectives: 'Nuclear binding energy, radioactivity, nuclear reactions, fission, fusion.' },
          { unitId: 'unit_5', topic: 'Chapter 14: Semiconductor Electronics', month: 'February', objectives: 'Semiconductors, p-n junction, diode, transistor, logic gates, optoelectronic devices.' },
        ],
      },
    },

    chemistry: {
      '12': {
        description: 'NCERT Chemistry Class 12',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: The Solid State', month: 'June', objectives: 'Types of solids, crystal systems, unit cell, imperfections, electrical and magnetic properties.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Solutions', month: 'June', objectives: 'Types of solutions, concentration, colligative properties, van\'t Hoff factor.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Electrochemistry', month: 'July', objectives: 'Electrochemical cells, EMF, Nernst equation, electrolysis, batteries, corrosion.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Chemical Kinetics', month: 'August', objectives: 'Rate of reaction, rate law, order, Arrhenius equation, collision theory.' },
          { unitId: 'unit_3', topic: 'Chapter 6: General Principles and Processes of Isolation of Elements', month: 'September', objectives: 'Occurrence, concentration of ores, thermodynamic and electrochemical principles of metallurgy.' },
          { unitId: 'unit_3', topic: 'Chapter 7: p-Block Elements', month: 'October', objectives: 'Group 15, 16, 17, 18 elements — preparation, properties, uses.' },
          { unitId: 'unit_4', topic: 'Chapter 8: d and f Block Elements', month: 'November', objectives: 'Transition elements, lanthanides and actinides, properties.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Coordination Compounds', month: 'December', objectives: 'Ligands, nomenclature, isomerism, VBT, CFT, stability constants, applications.' },
          { unitId: 'unit_5', topic: 'Chapter 10: Haloalkanes and Haloarenes', month: 'January', objectives: 'Nomenclature, preparation, reactions, mechanisms, uses, environmental impact.' },
          { unitId: 'unit_5', topic: 'Chapter 12: Aldehydes, Ketones and Carboxylic Acids', month: 'January', objectives: 'Nomenclature, preparation, chemical reactions, uses.' },
          { unitId: 'unit_5', topic: 'Chapter 14: Biomolecules', month: 'February', objectives: 'Carbohydrates, proteins, enzymes, vitamins, nucleic acids.' },
          { unitId: 'unit_5', topic: 'Chapter 15: Polymers', month: 'March', objectives: 'Classification, polymerisation methods, commercial polymers, biodegradable polymers.' },
        ],
      },
    },

    biology: {
      '12': {
        description: 'NCERT Biology Class 12',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Reproduction in Organisms', month: 'June', objectives: 'Modes of reproduction, asexual reproduction, sexual reproduction — life cycles.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Sexual Reproduction in Flowering Plants', month: 'July', objectives: 'Flower structure, pollen, fertilization, embryo development, fruits and seeds.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Human Reproduction', month: 'July', objectives: 'Male/female reproductive systems, gametogenesis, fertilization, pregnancy, parturition.' },
          { unitId: 'unit_2', topic: 'Chapter 5: Principles of Inheritance and Variation', month: 'August', objectives: 'Mendel\'s laws, inheritance of traits, chromosomal theory, linkage, mutation.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Molecular Basis of Inheritance', month: 'September', objectives: 'DNA structure, replication, transcription, translation, genetic code.' },
          { unitId: 'unit_3', topic: 'Chapter 7: Evolution', month: 'October', objectives: 'Origin of life, theories of evolution, natural selection, human evolution.' },
          { unitId: 'unit_4', topic: 'Chapter 8: Human Health and Disease', month: 'November', objectives: 'Common diseases, immunity, AIDS, cancer, drugs and alcohol abuse.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Strategies for Enhancement in Food Production', month: 'November', objectives: 'Animal and plant breeding, tissue culture, biofortification, SCP.' },
          { unitId: 'unit_4', topic: 'Chapter 10: Microbes in Human Welfare', month: 'December', objectives: 'Microbes in household products, industry, medicine, sewage treatment, biogas.' },
          { unitId: 'unit_5', topic: 'Chapter 11: Biotechnology — Principles and Processes', month: 'January', objectives: 'Recombinant DNA technology, PCR, gel electrophoresis, cloning vectors.' },
          { unitId: 'unit_5', topic: 'Chapter 13: Organisms and Populations', month: 'February', objectives: 'Niche, population growth models, interactions: competition, predation, mutualism.' },
          { unitId: 'unit_5', topic: 'Chapter 15: Biodiversity and Conservation', month: 'March', objectives: 'Types of biodiversity, loss of biodiversity, in situ and ex situ conservation.' },
        ],
      },
    },
  },

  // ─── Osmania University (OU) / College Commerce ─────────────────────────────
  'state board': {
    'corporate accounting': {
      'b.com 1': {
        description: 'OU / State Board — Corporate Accounting (B.Com Year 1)',
        chapters: [
          { unitId: 'unit_1', topic: 'Unit I: Issue of Shares', month: 'June', objectives: 'Types of shares, issue at par/premium/discount, pro-rata allotment, calls in arrears, forfeiture and reissue of shares.' },
          { unitId: 'unit_2', topic: 'Unit II: Issue and Redemption of Preference Shares', month: 'August', objectives: 'Conditions for redemption, sources of redemption, capital redemption reserve, journal entries.' },
          { unitId: 'unit_3', topic: 'Unit III: Issue and Redemption of Debentures', month: 'October', objectives: 'Types of debentures, issue at par/premium/discount, redemption methods: installment, sinking fund, purchase from open market.' },
          { unitId: 'unit_4', topic: 'Unit IV: Final Accounts of Joint Stock Companies', month: 'December', objectives: 'Statement of P&L and Balance Sheet as per Companies Act, managerial remuneration, appropriation of profits.' },
          { unitId: 'unit_5', topic: 'Unit V: Valuation of Goodwill and Shares', month: 'February', objectives: 'Methods of goodwill valuation: super profit, capitalization, weighted average. Intrinsic and market value of shares.' },
        ],
      },
      'b.com 2': {
        description: 'OU / State Board — Corporate Accounting (B.Com Year 2)',
        chapters: [
          { unitId: 'unit_1', topic: 'Unit I: Amalgamation of Companies', month: 'June', objectives: 'Purchase consideration, pooling of interests method, purchase method, accounting for amalgamation.' },
          { unitId: 'unit_2', topic: 'Unit II: Absorption and Reconstruction', month: 'August', objectives: 'Internal and external reconstruction, alteration of share capital, journal entries.' },
          { unitId: 'unit_3', topic: 'Unit III: Liquidation of Companies', month: 'October', objectives: 'Types of liquidation, liquidator\'s final statement of account, preferential creditors, B list contributories.' },
          { unitId: 'unit_4', topic: 'Unit IV: Holding Company Accounts', month: 'December', objectives: 'Consolidated balance sheet, minority interest, pre-acquisition profits, inter-company transactions.' },
          { unitId: 'unit_5', topic: 'Unit V: Analysis of Financial Statements', month: 'February', objectives: 'Ratio analysis — liquidity, profitability, solvency ratios; fund flow and cash flow statements.' },
        ],
      },
    },

    'business mathematics and statistics': {
      'b.com 1': {
        description: 'OU / State Board — Business Mathematics and Statistics I (B.Com Year 1)',
        chapters: [
          { unitId: 'unit_1', topic: 'Unit I: Matrices and Determinants', month: 'June', objectives: 'Types of matrices, matrix operations, determinants, Cramer\'s rule, inverse of a matrix, solving simultaneous equations.' },
          { unitId: 'unit_2', topic: 'Unit II: Differential Calculus', month: 'August', objectives: 'Limits, derivatives of standard functions, rules of differentiation, application to business problems: marginal cost, revenue, profit.' },
          { unitId: 'unit_3', topic: 'Unit III: Linear Programming', month: 'October', objectives: 'Formulation of LPP, graphical method, simplex method, duality, applications in business decisions.' },
          { unitId: 'unit_4', topic: 'Unit IV: Correlation and Regression', month: 'December', objectives: 'Karl Pearson\'s coefficient, Spearman\'s rank correlation, regression lines, regression equations, standard error.' },
          { unitId: 'unit_5', topic: 'Unit V: Index Numbers and Time Series', month: 'February', objectives: 'Price index, quantity index, Laspeyre\'s, Paasche\'s, Fisher\'s ideal index. Time series — components, trend analysis, moving averages.' },
        ],
      },
    },

    'financial accounting': {
      'b.com 1': {
        description: 'OU / State Board — Financial Accounting (B.Com Year 1)',
        chapters: [
          { unitId: 'unit_1', topic: 'Unit I: Introduction and Journal', month: 'June', objectives: 'Accounting concepts, conventions, journal entries, rules of debit and credit, compound entries.' },
          { unitId: 'unit_2', topic: 'Unit II: Ledger and Trial Balance', month: 'August', objectives: 'Posting from journal, balancing of accounts, preparation of trial balance, rectification of errors.' },
          { unitId: 'unit_3', topic: 'Unit III: Depreciation and Reserves', month: 'October', objectives: 'Methods of depreciation (SLM, WDV), change in method, provisions vs reserves.' },
          { unitId: 'unit_4', topic: 'Unit IV: Bills of Exchange and Consignment', month: 'December', objectives: 'Bills of exchange — honour, dishonour, renewal. Consignment accounts — del credere agent, normal/abnormal loss.' },
          { unitId: 'unit_5', topic: 'Unit V: Final Accounts of Sole Trader', month: 'February', objectives: 'Trading account, P&L account, balance sheet with adjustments.' },
        ],
      },
    },

    'principles of management': {
      'bba 1': {
        description: 'OU / State Board — Principles of Management (BBA Year 1)',
        chapters: [
          { unitId: 'unit_1', topic: 'Unit I: Introduction to Management', month: 'June', objectives: 'Definitions, characteristics, levels, management functions, managerial skills, evolution of management thought.' },
          { unitId: 'unit_2', topic: 'Unit II: Planning and Decision Making', month: 'August', objectives: 'Nature, types of plans, planning process, MBO, decision making — rational model, bounded rationality, types of decisions.' },
          { unitId: 'unit_3', topic: 'Unit III: Organising and Staffing', month: 'October', objectives: 'Organisation structure, departmentation, authority, delegation, decentralisation, recruitment, selection, training.' },
          { unitId: 'unit_4', topic: 'Unit IV: Directing and Leading', month: 'December', objectives: 'Supervision, motivation theories (Maslow, Herzberg, Vroom), leadership styles, communication process.' },
          { unitId: 'unit_5', topic: 'Unit V: Controlling and Emerging Trends', month: 'February', objectives: 'Control process, techniques — budgetary, non-budgetary. MIS, corporate governance, social responsibility.' },
        ],
      },
    },

    mathematics: {
      '10': {
        description: 'State Board Mathematics Class 10',
        chapters: [
          { unitId: 'unit_1', topic: 'Chapter 1: Real Numbers', month: 'June', objectives: 'Euclid\'s algorithm, fundamental theorem of arithmetic, irrational numbers.' },
          { unitId: 'unit_1', topic: 'Chapter 2: Sets', month: 'June', objectives: 'Types of sets, operations — union, intersection, complement, Venn diagrams.' },
          { unitId: 'unit_2', topic: 'Chapter 3: Polynomials', month: 'July', objectives: 'Zeros of polynomials, division algorithm, factor theorem, factorization.' },
          { unitId: 'unit_2', topic: 'Chapter 4: Pair of Linear Equations', month: 'August', objectives: 'Graphical and algebraic solution methods — substitution, elimination.' },
          { unitId: 'unit_3', topic: 'Chapter 5: Quadratic Equations', month: 'September', objectives: 'Factorization, completing square, quadratic formula, nature of roots.' },
          { unitId: 'unit_3', topic: 'Chapter 6: Progressions', month: 'October', objectives: 'A.P. and G.P. — nth term, sum of n terms, applications.' },
          { unitId: 'unit_4', topic: 'Chapter 7 & 8: Coordinate Geometry and Trigonometry', month: 'November', objectives: 'Distance formula, section formula, trigonometric ratios, identities, heights and distances.' },
          { unitId: 'unit_4', topic: 'Chapter 9: Applications of Trigonometry', month: 'December', objectives: 'Heights and distances using angles of elevation and depression.' },
          { unitId: 'unit_5', topic: 'Chapter 11 & 12: Mensuration', month: 'January', objectives: 'Areas of combinations of figures, surface area and volume of combined solids.' },
          { unitId: 'unit_5', topic: 'Chapter 13 & 14: Statistics and Probability', month: 'February', objectives: 'Mean, median, mode for grouped data; classical probability.' },
        ],
      },
    },
  },

  // ─── SSC Maharashtra ─────────────────────────────────────────────────────────
  ssc: {
    mathematics: {
      '10': {
        description: 'SSC Maharashtra Board Mathematics Class 10',
        chapters: [
          { unitId: 'unit_1', topic: 'Algebra: Linear Equations in Two Variables', month: 'June', objectives: 'Graphical and algebraic solution, word problems.' },
          { unitId: 'unit_1', topic: 'Algebra: Quadratic Equations', month: 'July', objectives: 'Factorization, formula method, nature of roots, word problems.' },
          { unitId: 'unit_2', topic: 'Algebra: Arithmetic Progression', month: 'August', objectives: 'nth term, sum of n terms, problems on AP.' },
          { unitId: 'unit_2', topic: 'Geometry: Similarity', month: 'August', objectives: 'Similar triangles, properties, Pythagoras theorem, angle bisector theorem.' },
          { unitId: 'unit_3', topic: 'Geometry: Circle', month: 'September', objectives: 'Tangent properties, theorem on chords, arc and angle relationships.' },
          { unitId: 'unit_3', topic: 'Geometry: Geometric Constructions', month: 'October', objectives: 'Division of a segment, tangent to a circle, inscribed and circumscribed figures.' },
          { unitId: 'unit_4', topic: 'Trigonometry', month: 'November', objectives: 'Trigonometric identities, application to heights and distances.' },
          { unitId: 'unit_4', topic: 'Mensuration', month: 'December', objectives: 'Surface area and volume of cylinder, cone, sphere, hemisphere, combinations.' },
          { unitId: 'unit_5', topic: 'Statistics', month: 'January', objectives: 'Mean, median, mode for grouped data, histograms, cumulative frequency graphs.' },
          { unitId: 'unit_5', topic: 'Probability', month: 'February', objectives: 'Classical probability, sample space, events, basic probability problems.' },
        ],
      },
    },

    science: {
      '10': {
        description: 'SSC Maharashtra Board Science and Technology Class 10',
        chapters: [
          { unitId: 'unit_1', topic: 'Gravitation', month: 'June', objectives: 'Newton\'s law of gravitation, free fall, escape velocity, satellites.' },
          { unitId: 'unit_1', topic: 'Periodic Classification of Elements', month: 'June', objectives: 'Modern periodic table, trends, Dobereiner\'s triads, Newland\'s octaves, Mendeleev\'s table.' },
          { unitId: 'unit_2', topic: 'Chemical Reactions and Equations', month: 'July', objectives: 'Types of reactions, balancing equations, redox reactions, corrosion.' },
          { unitId: 'unit_2', topic: 'Effects of Electric Current', month: 'August', objectives: 'Heating effect, magnetic effect, Faraday\'s law, AC generator, electric motor.' },
          { unitId: 'unit_3', topic: 'Life Processes', month: 'September', objectives: 'Nutrition, respiration, transportation, excretion in plants and animals.' },
          { unitId: 'unit_3', topic: 'Heredity and Evolution', month: 'October', objectives: 'Mendel\'s laws, sex determination, evolution, speciation.' },
          { unitId: 'unit_4', topic: 'Light: Reflection and Refraction', month: 'November', objectives: 'Reflection laws, refraction, lens formula, total internal reflection.' },
          { unitId: 'unit_4', topic: 'The Human Eye and the Colourful World', month: 'November', objectives: 'Defects of vision, dispersion of light, scattering, tyndall effect.' },
          { unitId: 'unit_5', topic: 'Our Environment', month: 'January', objectives: 'Food chains, ecosystems, waste management, ozone depletion.' },
          { unitId: 'unit_5', topic: 'Management of Natural Resources', month: 'February', objectives: 'Conservation of forests, water, coal, petroleum; sustainable development.' },
        ],
      },
    },
  },

  // ─── ICSE / ISC ──────────────────────────────────────────────────────────────
  icse: {
    mathematics: {
      '10': {
        description: 'ICSE Mathematics Class 10',
        chapters: [
          { unitId: 'unit_1', topic: 'Commercial Mathematics', month: 'June', objectives: 'GST, banking, shares and dividends, linear inequations.' },
          { unitId: 'unit_1', topic: 'Algebra — Quadratic Equations', month: 'July', objectives: 'Quadratic formula, nature of roots, word problems.' },
          { unitId: 'unit_2', topic: 'Algebra — Ratio and Proportion / Factor Theorem', month: 'August', objectives: 'Properties of ratios, factor and remainder theorem, matrices.' },
          { unitId: 'unit_3', topic: 'Geometry — Circles and Tangents', month: 'September', objectives: 'Angle properties of circles, tangent properties, loci.' },
          { unitId: 'unit_3', topic: 'Geometry — Constructions and Similarity', month: 'October', objectives: 'Similar triangles, Pythagoras theorem, loci constructions.' },
          { unitId: 'unit_4', topic: 'Mensuration and Trigonometry', month: 'November', objectives: 'Surface area and volume of combined solids, trigonometric identities, heights and distances.' },
          { unitId: 'unit_5', topic: 'Statistics and Probability', month: 'January', objectives: 'Mean, median from ogives, quartiles, histograms, probability.' },
          { unitId: 'unit_5', topic: 'Coordinate Geometry', month: 'February', objectives: 'Equation of a line, slope-intercept form, section formula, distance formula.' },
        ],
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP FUNCTION
// Matches publisher + subject + class case-insensitively with fuzzy fallback.
// ─────────────────────────────────────────────────────────────────────────────
export function lookupCurriculum(
  publisher: string,
  subject: string,
  cls: string,
): CurriculumEntry | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();

  const pubKey = normalize(publisher);
  const subKey = normalize(subject);
  const clsKey = normalize(cls);

  // Try direct publisher match
  const pubEntry = Object.entries(CURRICULUM_DB).find(([k]) => normalize(k) === pubKey || normalize(k).includes(pubKey) || pubKey.includes(normalize(k)));
  if (!pubEntry) return null;
  const [, subjectMap] = pubEntry;

  // Fuzzy subject match
  const subEntry = Object.entries(subjectMap).find(([k]) => {
    const nk = normalize(k);
    return nk === subKey || nk.includes(subKey) || subKey.includes(nk);
  });
  if (!subEntry) return null;
  const [, classMap] = subEntry;

  // Fuzzy class match
  const classEntry = Object.entries(classMap).find(([k]) => {
    const nk = normalize(k);
    return nk === clsKey || nk.includes(clsKey) || clsKey.includes(nk);
  });
  if (!classEntry) return null;

  return classEntry[1];
}

/**
 * Returns all available class options for a given publisher + subject combination.
 */
export function getAvailableClasses(publisher: string, subject: string): string[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  const pubKey = normalize(publisher);
  const subKey = normalize(subject);

  const pubEntry = Object.entries(CURRICULUM_DB).find(([k]) => normalize(k) === pubKey || normalize(k).includes(pubKey) || pubKey.includes(normalize(k)));
  if (!pubEntry) return [];

  const subEntry = Object.entries(pubEntry[1]).find(([k]) => {
    const nk = normalize(k);
    return nk === subKey || nk.includes(subKey) || subKey.includes(nk);
  });
  if (!subEntry) return [];

  return Object.keys(subEntry[1]);
}

export { CURRICULUM_DB };
