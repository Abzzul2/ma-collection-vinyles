// 1. CONFIGURATION
const CONFIG = {
    get DISCOGS_TOKEN() {
        let token = localStorage.getItem('discogs_personal_token');
        if (!token) {
            token = prompt("Veuillez entrer votre jeton Discogs :");
            if (token) localStorage.setItem('discogs_personal_token', token);
        }
        return token;
    },
    STORAGE_KEY: "monVinyleCollec"
};

// 2. SUPABASE
const SUPABASE_URL = 'https://vmyfguplxbitmffrexfx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iFQwJX4MpLFoNZAYPK7XLg_6o7_vsJN';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. ÉTAT GLOBAL
let maCollection = []; 
let currentSort = 'dateDesc';
let currentFilters = { artiste: 'all', tags: [] };

// 4. DÉMARRAGE
document.addEventListener("DOMContentLoaded", async () => {
    await chargerCollectionDepuisCloud(); 
    
    // Au lieu de initializePage(), on appelle tes fonctions de rendu réelles
    if (document.getElementById("recentCollection")) {
        afficherDashboard();
    }
    if (document.getElementById("fullCollection")) {
        afficherTouteLaCollection();
        afficherStatistiques();
        initializerControlesCollection(); // Pour activer les tris/filtres
    }
});

// 5. FONCTIONS DE SYNCHRO
async function chargerCollectionDepuisCloud() {
    try {
        const { data, error } = await supabaseClient
            .from('vinyles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        maCollection = data.map(v => ({
            ...v,
            annee: v.year_release,    // Re-mappage pour ton code existant
            anneeOriginale: v.year_original,
            dateAjout: v.created_at || new Date().toISOString()
        }));
        console.log("✅ Collection synchronisée avec Supabase !");
    } catch (error) {
        console.error("❌ Erreur de chargement:", error.message);
        // Secours sur le localStorage si le cloud échoue
        maCollection = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
    }
}

function genererHTMLCarte(data, type) {
    const titreNettoye = data.titre ? data.titre.split(" – ").pop() : "Titre inconnu";
    const imageUrl = data.image || "https://via.placeholder.com/280x280?text=No+Image";
    
    // Gestion de l'affichage des années (originale vs réédition)
    let affichageAnnee = "";
    if (data.anneeOriginale && data.anneeOriginale !== data.annee && data.anneeOriginale !== "N/A") {
        affichageAnnee = `📅 ${data.anneeOriginale || "N/A"} <span class="reissue-badge">(Réédition ${data.annee})</span>`;
    } else {
        affichageAnnee = `📅 ${data.annee || "N/A"} <span class="original-badge">(Original)</span>`;
    }
    
    // Génération des tags pour la collection
    let tagsHTML = "";
    if (type === 'collection' && data.tags && data.tags.length > 0) {
        tagsHTML = `<div class="tags-container">
            ${data.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>`;
    }
    
    // URL Discogs
    const discogsUrl = `https://www.discogs.com/release/${data.id}`;
    
    return `
        <div class="product" style="animation-delay: ${Math.random() * 0.3}s" data-vinyl-id="${data.id}">
            <a href="${discogsUrl}" target="_blank" class="product-link" aria-label="Voir sur Discogs">
                <img 
                    src="${imageUrl}" 
                    alt="${escapeHtml(titreNettoye)}"
                    onerror="this.src='https://via.placeholder.com/280x280?text=No+Image'"
                >
            </a>
            <div class="product-info">
                <a href="${discogsUrl}" target="_blank" class="product-title-link">
                    <div class="product-title">${escapeHtml(titreNettoye)}</div>
                </a>
                <p>🎤 ${escapeHtml(data.artiste || "Inconnu")}</p>
                <p>${affichageAnnee}</p>
                ${data.pays ? `<p>🌍 ${escapeHtml(data.pays)}</p>` : ""}
                ${data.label ? `<p class="label-info" style="font-style: normal;">🏢 ${escapeHtml(data.label)}</p>` : ""}
                ${data.matrices && type === 'search' 
                    ? `<div class="matrix-info">
                        <div class="matrix-label">🔍 Matrices :</div>
                        <div class="matrix-values">${escapeHtml(data.matrices)}</div>
                       </div>` 
                    : ""}
                ${tagsHTML}
            </div>
            ${type === 'search' 
                ? `<button class="add-btn" onclick="saveToCollection(${data.id})" aria-label="Ajouter à la collection">
                    ✓ Ajouter
                   </button>` 
                : `<div class="collection-actions">
                    <button class="tag-btn" onclick="ouvrirGestionTags(${data.id})" aria-label="Gérer les tags">
                        🏷️ Tags
                    </button>
                    <button class="delete-btn" onclick="confirmerSuppression(${data.id})" aria-label="Supprimer de la collection">
                        ✕ Supprimer
                    </button>
                   </div>`}
        </div>`;
}

// ===================================
// RECHERCHE
// ===================================

/**
 * Recherche des vinyles par code-barres
 */
async function search() {
    const barcodeInput = document.getElementById("barcodeInput");
    const barcode = barcodeInput.value.trim();
    const resultsDiv = document.getElementById("results");
    
    // Validation
    if (!barcode) {
        showToast("Veuillez entrer un code-barres", "error");
        barcodeInput.focus();
        return;
    }
    
    // État de chargement
    resultsDiv.innerHTML = '<div class="loading-message">Recherche en cours...</div>';
    
    try {
        // Recherche via API Discogs (filtre type=release pour les disques uniquement)
        const response = await fetch(
            `https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release&token=${CONFIG.DISCOGS_TOKEN}`
        );
        
        if (!response.ok) {
            throw new Error(`Erreur API: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Aucun résultat
        if (!data.results || data.results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="empty-state">
                    <h3>Aucun résultat trouvé</h3>
                    <p>Le code-barres "${escapeHtml(barcode)}" ne correspond à aucun vinyle.</p>
                </div>`;
            return;
        }
        
        // Récupération des détails pour chaque résultat
        resultsDiv.innerHTML = "";
        const promises = data.results.slice(0, CONFIG.MAX_SEARCH_RESULTS).map(async (release) => {
            try {
                const detailResponse = await fetch(
                    `https://api.discogs.com/releases/${release.id}?token=${CONFIG.DISCOGS_TOKEN}`
                );
                
                if (!detailResponse.ok) {
                    throw new Error(`Erreur détails: ${detailResponse.status}`);
                }
                
                const detail = await detailResponse.json();
                
                // Récupérer l'année originale via le master si disponible
                let anneeOriginale = null;
                if (detail.master_id) {
                    try {
                        const masterResponse = await fetch(
                            `https://api.discogs.com/masters/${detail.master_id}?token=${CONFIG.DISCOGS_TOKEN}`
                        );
                        if (masterResponse.ok) {
                            const master = await masterResponse.json();
                            anneeOriginale = master.year;
                        }
                    } catch (error) {
                        console.log(`Impossible de récupérer le master pour ${detail.master_id}`);
                    }
                }
                
                // Extraction des matrices (plus complète)
                const matrices = detail.identifiers
                    ?.filter(i => i.type === "Matrix / Runout")
                    .map(i => i.value)
                    .join(" | ") || "Non spécifiée";
                
                // Extraction du label
                const label = detail.labels && detail.labels.length > 0 
                    ? detail.labels[0].name 
                    : null;
                
                return {
                    id: release.id,
                    titre: detail.title,
                    artiste: detail.artists ? detail.artists[0].name : "Inconnu",
                    annee: detail.year,
                    anneeOriginale: anneeOriginale,
                    image: detail.images && detail.images.length > 0 ? detail.images[0].uri : "",
                    matrices: matrices,
                    pays: detail.country,
                    label: label
                };
            } catch (error) {
                console.error(`Erreur détails pour ${release.id}:`, error);
                return null;
            }
        });
        
        const results = await Promise.all(promises);
        const validResults = results.filter(r => r !== null);
        
        if (validResults.length === 0) {
            resultsDiv.innerHTML = `
                <div class="error-message">
                    Impossible de charger les détails des résultats.
                </div>`;
            return;
        }
        
        // Affichage des résultats
        resultsDiv.innerHTML = validResults
            .map(item => genererHTMLCarte(item, 'search'))
            .join("");
            
    } catch (error) {
        console.error("Erreur de recherche:", error);
        resultsDiv.innerHTML = `
            <div class="error-message">
                ❌ Erreur de connexion à Discogs. Veuillez réessayer.
            </div>`;
        showToast("Erreur de connexion", "error");
    }
}

// ===================================
// GESTION DE LA COLLECTION
// ===================================

/**
 * Ajoute un vinyle à la collection
 * @param {number} id - ID Discogs du vinyle
 */

async function saveToCollection(id) {
    // 1. Vérifier si déjà dans la collection locale pour éviter les doublons inutiles
    if (maCollection.find(v => v.id === id)) {
        showToast("Ce vinyle est déjà dans votre collection", "error");
        return;
    }
    
    try {
        // 2. Récupération des détails complets sur l'API Discogs
        const response = await fetch(
            `https://api.discogs.com/releases/${id}?token=${CONFIG.DISCOGS_TOKEN}`
        );
        
        if (!response.ok) {
            throw new Error(`Erreur API Discogs: ${response.status}`);
        }
        
        const res = await response.json();
        
        // 3. Récupération de l'année originale via le "Master Release"
        let anneeOriginale = null;
        if (res.master_id) {
            try {
                const masterResponse = await fetch(
                    `https://api.discogs.com/masters/${res.master_id}?token=${CONFIG.DISCOGS_TOKEN}`
                );
                if (masterResponse.ok) {
                    const master = await masterResponse.json();
                    anneeOriginale = master.year;
                }
            } catch (error) {
                console.warn(`Impossible de récupérer l'année originale pour le master ${res.master_id}`);
            }
        }
        
        // 4. Préparation de l'objet avec la nouvelle nomenclature
        const newItem = {
            id: id,
            titre: res.title,
            artiste: res.artists ? res.artists[0].name : "Inconnu",
            year_release: res.year || null,      // L'année de cette édition précise
            year_original: anneeOriginale,      // L'année de la 1ère parution mondiale
            image: res.images && res.images.length > 0 ? res.images[0].uri : "",
            pays: res.country || "Inconnu",
            label: res.labels && res.labels.length > 0 ? res.labels[0].name : null,
            tags: [] // Initialisé vide, géré ensuite par ouvrirGestionTags
        };
        
        // 5. Sauvegarde persistante sur Supabase
        const { data, error } = await supabase
            .from('vinyles')
            .insert([newItem])
            .select();

        if (error) throw error;
        
        // 6. Mise à jour de l'état local et de l'interface
        maCollection.push(newItem);
        
        // On trie par défaut par ajout récent (le dernier en fin de tableau)
        showToast("✓ Synchronisé dans le Cloud !");
        
        // Rafraîchir l'affichage
        if (document.getElementById("recentCollection")) {
            afficherDashboard();
        }
        if (document.getElementById("fullCollection")) {
            afficherTouteLaCollection();
        }
        
    } catch (error) {
        console.error("Erreur sauvegarde Supabase:", error);
        showToast("Erreur lors de la synchronisation", "error");
    }
}

/**
 * Demande confirmation avant suppression
 * @param {number} id - ID du vinyle à supprimer
 */
function confirmerSuppression(id) {
    const vinyle = maCollection.find(v => v.id === id);
    if (!vinyle) return;
    
    const titreNettoye = vinyle.titre ? vinyle.titre.split(" – ").pop() : "ce vinyle";
    
    if (confirm(`Voulez-vous vraiment supprimer "${titreNettoye}" de votre collection ?`)) {
        supprimerVinyle(id);
    }
}

/**
 * Supprime un vinyle de la collection
 * @param {number} id - ID du vinyle à supprimer
 */
async function supprimerVinyle(id) {
    try {
        // 1. Suppression dans la base de données
        const { error } = await supabase
            .from('vinyles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // 2. Mise à jour locale si la DB a bien supprimé
        maCollection = maCollection.filter(v => v.id !== id);
        
        // 3. Rafraîchir l'interface
        if (document.getElementById("recentCollection")) afficherDashboard();
        if (document.getElementById("fullCollection")) {
            afficherTouteLaCollection();
            afficherStatistiques();
        }
        
        showToast("Vinyle supprimé partout !");
    } catch (error) {
        console.error("Erreur suppression:", error.message);
        showToast("Erreur lors de la suppression", "error");
    }
}

// ===================================
// GESTION DES TAGS
// ===================================

/**
 * Ouvre le modal de gestion des tags
 * @param {number} id - ID du vinyle
 */
function ouvrirGestionTags(id) {
    const vinyle = maCollection.find(v => v.id === id);
    if (!vinyle) return;
    
    const titreNettoye = vinyle.titre ? vinyle.titre.split(" – ").pop() : "Titre inconnu";
    
    // Créer le modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🏷️ Gérer les tags</h3>
                <button class="modal-close" onclick="fermerModal()">&times;</button>
            </div>
            <div class="modal-body">
                <p class="modal-vinyl-title">${escapeHtml(titreNettoye)}</p>
                <div class="current-tags">
                    ${vinyle.tags && vinyle.tags.length > 0 
                        ? vinyle.tags.map(tag => `
                            <span class="tag tag-removable">
                                ${escapeHtml(tag)}
                                <button onclick="retirerTag(${id}, '${escapeHtml(tag)}')">&times;</button>
                            </span>
                          `).join('')
                        : '<p class="no-tags">Aucun tag pour le moment</p>'}
                </div>
                <div class="add-tag-section">
                    <input 
                        type="text" 
                        id="newTagInput" 
                        placeholder="Nouveau tag..."
                        maxlength="30"
                    >
                    <button onclick="ajouterTag(${id})" class="add-tag-btn">Ajouter</button>
                </div>
                <div class="tags-suggestions">
                    <p class="suggestions-label">Suggestions :</p>
                    ${genererSuggestionsTags(vinyle).map(tag => 
                        `<button class="tag-suggestion" onclick="ajouterTagRapide(${id}, '${escapeHtml(tag)}')">${escapeHtml(tag)}</button>`
                    ).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus sur l'input
    setTimeout(() => {
        const input = document.getElementById('newTagInput');
        if (input) {
            input.focus();
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    ajouterTag(id);
                }
            });
        }
    }, 100);
}

/**
 * Génère des suggestions de tags basées sur le vinyle
 * @param {Object} vinyle - Données du vinyle
 * @returns {Array} Liste de suggestions
 */
function genererSuggestionsTags(vinyle) {
    const suggestions = [];
    
    // Suggestions basées sur les caractéristiques
    if (vinyle.anneeOriginale && vinyle.anneeOriginale !== vinyle.annee) {
        suggestions.push('Réédition');
    } else {
        suggestions.push('Original');
    }
    
    if (vinyle.pays) {
        suggestions.push(vinyle.pays);
    }
    
    // Suggestions par décennie
    const annee = vinyle.anneeOriginale || vinyle.annee;
    if (annee) {
        const decennie = Math.floor(annee / 10) * 10;
        suggestions.push(`${decennie}s`);
    }
    
    // Suggestions génériques
    const suggestionsGeneriques = [
        'Favoris', 'À écouter', 'Classique', 'Découverte',
        'Cadeau', 'Rare', 'Collection principale'
    ];
    
    return [...new Set([...suggestions, ...suggestionsGeneriques])].slice(0, 6);
}

/**
 * Ajoute un tag à un vinyle
 * @param {number} id - ID du vinyle
 */
function ajouterTag(id) {
    const input = document.getElementById('newTagInput');
    const tag = input.value.trim();
    
    if (!tag) {
        showToast("Veuillez entrer un tag", "error");
        return;
    }
    
    const vinyle = maCollection.find(v => v.id === id);
    if (!vinyle) return;
    
    // Initialiser les tags si nécessaire
    if (!vinyle.tags) vinyle.tags = [];
    
    // Vérifier si le tag existe déjà
    if (vinyle.tags.includes(tag)) {
        showToast("Ce tag existe déjà", "error");
        return;
    }
    
    // Ajouter le tag
    vinyle.tags.push(tag);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(maCollection));
    
    // Mise à jour de l'affichage
    fermerModal();
    ouvrirGestionTags(id);
    afficherTouteLaCollection();
    initializerControlesCollection();
    showToast("Tag ajouté !");
}

/**
 * Ajoute rapidement un tag suggéré
 * @param {number} id - ID du vinyle
 * @param {string} tag - Tag à ajouter
 */
function ajouterTagRapide(id, tag) {
    const vinyle = maCollection.find(v => v.id === id);
    if (!vinyle) return;
    
    if (!vinyle.tags) vinyle.tags = [];
    
    if (vinyle.tags.includes(tag)) {
        showToast("Ce tag existe déjà", "error");
        return;
    }
    
    vinyle.tags.push(tag);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(maCollection));
    
    fermerModal();
    ouvrirGestionTags(id);
    afficherTouteLaCollection();
    initializerControlesCollection();
    showToast("Tag ajouté !");
}

/**
 * Retire un tag d'un vinyle
 * @param {number} id - ID du vinyle
 * @param {string} tag - Tag à retirer
 */
function retirerTag(id, tag) {
    const vinyle = maCollection.find(v => v.id === id);
    if (!vinyle) return;
    
    vinyle.tags = vinyle.tags.filter(t => t !== tag);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(maCollection));
    
    fermerModal();
    ouvrirGestionTags(id);
    afficherTouteLaCollection();
    initializerControlesCollection();
    showToast("Tag retiré");
}

/**
 * Ferme le modal
 */
function fermerModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
}

// ===================================
// TRI ET FILTRES
// ===================================

/**
 * Initialise les contrôles de tri et filtres (Artiste et Tag uniquement)
 */
function initializerControlesCollection() {
    const controlsContainer = document.querySelector('.collection-controls');
    if (!controlsContainer) return;
    
    // Récupérer les valeurs uniques
    const artistesUniques = [...new Set(maCollection.map(v => v.artiste).filter(Boolean))].sort();
    const tagsUniques = [...new Set(maCollection.flatMap(v => v.tags || []))].sort();
    
    controlsContainer.innerHTML = `
        <div class="controls-section">
            <div class="control-group">
                <label for="sortSelect">📊 Trier par :</label>
                <select id="sortSelect" onchange="changerTri(this.value)">
                    <option value="dateDesc">Ajoutés récemment</option>
                    <option value="dateAsc">Ajoutés anciennement</option>
                    <option value="artisteAsc">Artiste (A → Z)</option>
                    <option value="artisteDesc">Artiste (Z → A)</option>
                    <option value="titreAsc">Titre d'album (A → Z)</option>
                    <option value="titreDesc">Titre d'album (Z → A)</option>
                    <option value="anneeDesc">Année de sortie (Récent → Ancien)</option>
                    <option value="anneeAsc">Année de sortie (Ancien → Récent)</option>
                </select>
            </div>
            
            <div class="control-group">
                <label for="artisteFilter">🎤 Artiste :</label>
                <select id="artisteFilter" onchange="changerFiltre('artiste', this.value)">
                    <option value="all">Tous les artistes</option>
                    ${artistesUniques.map(art => `<option value="${escapeHtml(art)}">${escapeHtml(art)}</option>`).join('')}
                </select>
            </div>
            
            <div class="control-group">
                <label for="tagFilter">🏷️ Tag :</label>
                <select id="tagFilter" onchange="changerFiltreTag(this.value)">
                    <option value="">Tous les tags</option>
                    ${tagsUniques.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join('')}
                </select>
            </div>
            
            <button class="reset-filters-btn" onclick="reinitialiserFiltres()">🔄 Réinitialiser</button>
        </div>
        <div class="result-count">${maCollection.length} vinyle${maCollection.length > 1 ? 's' : ''}</div>
    `;
    
    // Restaurer les valeurs
    document.getElementById('sortSelect').value = currentSort;
    document.getElementById('artisteFilter').value = currentFilters.artiste || 'all';
    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter && currentFilters.tags.length > 0) {
        tagFilter.value = currentFilters.tags[0];
    }
}

/**
 * Change le tri de la collection
 * @param {string} sortType - Type de tri
 */
function changerTri(sortType) {
    currentSort = sortType;
    afficherTouteLaCollection();
}

/**
 * Change un filtre
 * @param {string} filterType - Type de filtre
 * @param {string} value - Valeur du filtre
 */
function changerFiltre(filterType, value) {
    currentFilters[filterType] = value;
    afficherTouteLaCollection();
}

/**
 * Change le filtre de tag
 * @param {string} tag - Tag à filtrer
 */
function changerFiltreTag(tag) {
    if (tag) {
        currentFilters.tags = [tag];
    } else {
        currentFilters.tags = [];
    }
    afficherTouteLaCollection();
}

/**
 * Réinitialise tous les filtres
 */
function reinitialiserFiltres() {
    currentSort = 'dateDesc';
    currentFilters = { artiste: 'all', tags: [] };
    
    if (document.getElementById('sortSelect')) document.getElementById('sortSelect').value = 'dateDesc';
    if (document.getElementById('artisteFilter')) document.getElementById('artisteFilter').value = 'all';
    if (document.getElementById('tagFilter')) document.getElementById('tagFilter').value = '';
    
    afficherTouteLaCollection();
    showToast("Filtres réinitialisés");
}

/**
 * Applique les filtres à la collection
 */
function appliquerFiltres(collection) {
    let filtered = [...collection];
    
    // Filtre par artiste
    if (currentFilters.artiste && currentFilters.artiste !== 'all') {
        filtered = filtered.filter(v => v.artiste === currentFilters.artiste);
    }
    
    // Filtre par tags
    if (currentFilters.tags && currentFilters.tags.length > 0) {
        filtered = filtered.filter(v => {
            if (!v.tags) return false;
            return currentFilters.tags.some(tag => v.tags.includes(tag));
        });
    }
    
    return filtered;
}

/**
 * Applique le tri à la collection
 * @param {Array} collection - Collection à trier
 * @returns {Array} Collection triée
 */
function appliquerTri(collection) {
    const sorted = [...collection];
    
    switch(currentSort) {
        case 'dateDesc':
            return sorted.sort((a, b) => new Date(b.dateAjout) - new Date(a.dateAjout));
        case 'dateAsc':
            return sorted.sort((a, b) => new Date(a.dateAjout) - new Date(b.dateAjout));
        case 'artisteAsc':
            return sorted.sort((a, b) => (a.artiste || '').localeCompare(b.artiste || ''));
        case 'artisteDesc':
            return sorted.sort((a, b) => (b.artiste || '').localeCompare(a.artiste || ''));
        case 'titreAsc':
            // On nettoie le titre pour le tri (ignore le "Artist - ")
            const getTitreAsc = (t) => t.split(" – ").pop();
            return sorted.sort((a, b) => getTitreAsc(a.titre).localeCompare(getTitreAsc(b.titre)));
        case 'titreDesc':
            // On nettoie le titre pour le tri (ignore le "Artist - ")
            const getTitreDesc = (t) => t.split(" – ").pop();
            return sorted.sort((a, b) => getTitreDesc(b.titre).localeCompare(getTitreDesc(a.titre)));
        case 'anneeAsc':
            return sorted.sort((a, b) => (a.anneeOriginale || a.annee || 9999) - (b.anneeOriginale || b.annee || 9999));
        case 'anneeDesc':
            return sorted.sort((a, b) => (b.anneeOriginale || b.annee || 0) - (a.anneeOriginale || a.annee || 0));
        default:
            return sorted;
    }
}

// ===================================
// AFFICHAGE
// ===================================

/**
 * Affiche le dashboard avec les derniers vinyles ajoutés
 */
function afficherDashboard() {
    const listDiv = document.getElementById("recentCollection");
    if (!listDiv) return;
    
    if (maCollection.length === 0) {
        listDiv.innerHTML = `
            <div class="empty-state">
                <h3>Votre collection est vide</h3>
                <p>Utilisez le scanner ci-dessus pour ajouter vos premiers vinyles !</p>
            </div>`;
        return;
    }
    
    // Afficher les 5 derniers vinyles ajoutés (les plus récents en premier)
    const recentItems = maCollection.slice(-CONFIG.MAX_RECENT_ITEMS).reverse();
    listDiv.innerHTML = recentItems
        .map(item => genererHTMLCarte(item, 'collection'))
        .join("");
}

/**
 * Affiche toute la collection
 */
function afficherTouteLaCollection() {
    const listDiv = document.getElementById("fullCollection");
    if (!listDiv) return;
    
    if (maCollection.length === 0) {
        listDiv.innerHTML = `
            <div class="empty-state">
                <h3>Votre collection est vide</h3>
                <p>Retournez à l'accueil pour scanner vos premiers vinyles !</p>
            </div>`;
        return;
    }
    
    // Appliquer les filtres et le tri
    let collectionAffichee = appliquerFiltres(maCollection);
    collectionAffichee = appliquerTri(collectionAffichee);
    
    if (collectionAffichee.length === 0) {
        listDiv.innerHTML = `
            <div class="empty-state">
                <h3>Aucun résultat</h3>
                <p>Aucun vinyle ne correspond aux filtres sélectionnés.</p>
            </div>`;
        return;
    }
    
    listDiv.innerHTML = collectionAffichee
        .map(item => genererHTMLCarte(item, 'collection'))
        .join("");
        
    // Mettre à jour le compteur si présent
    const resultCount = document.querySelector('.result-count');
    if (resultCount) {
        resultCount.textContent = `${collectionAffichee.length} vinyle${collectionAffichee.length > 1 ? 's' : ''}`;
    }
}

/**
 * Affiche les statistiques de la collection
 */
function afficherStatistiques() {
    const statsContainer = document.querySelector(".collection-stats");
    if (!statsContainer) return;
    
    const totalVinyles = maCollection.length;
    const artistesUniques = new Set(maCollection.map(v => v.artiste)).size;
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${totalVinyles}</div>
            <div class="stat-label">Vinyles</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${artistesUniques}</div>
            <div class="stat-label">Artistes</div>
        </div>
    `;
}

// ===================================
// UTILITAIRES
// ===================================

/**
 * Échappe les caractères HTML pour éviter les injections XSS
 * @param {string} text - Texte à échapper
 * @returns {string} Texte échappé
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Affiche une notification toast
 * @param {string} message - Message à afficher
 * @param {string} type - Type de toast ('success' ou 'error')
 */
function showToast(message, type = "success") {
    // Supprimer les toasts existants
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    // Créer le nouveau toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    document.body.appendChild(toast);
    
    // Suppression automatique après 3 secondes
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * Initialise et lance le scanner de caméra
 */
async function toggleScanner() {
    const scannerContainer = document.getElementById('reader');
    if (!scannerContainer) return;

    if (scannerContainer.style.display === 'none' || !scannerContainer.style.display) {
        scannerContainer.style.display = 'block';
        
        const html5QrCode = new Html5Qrcode("reader");
        window.scannerInstance = html5QrCode;

        const config = { fps: 10, qrbox: { width: 250, height: 150 } };

        try {
            await html5QrCode.start(
                { facingMode: "environment" }, 
                config,
                (decodedText) => {
                    // Succès du scan
                    document.getElementById('barcodeInput').value = decodedText;
                    stopScanner();
                    search(); // Lance la recherche automatiquement
                }
            );
        } catch (err) {
            console.error("Erreur caméra:", err);
            showToast("Impossible d'accéder à la caméra", "error");
        }
    } else {
        stopScanner();
    }
}

function stopScanner() {
    if (window.scannerInstance) {
        window.scannerInstance.stop().then(() => {
            document.getElementById('reader').style.display = 'none';
        });
    }
}

/**
 * Exporte la collection au format CSV
 */
function exporterCSV() {
    if (maCollection.length === 0) {
        showToast("La collection est vide", "error");
        return;
    }

    // En-têtes du fichier
    const headers = ["Artiste", "Titre", "Annee", "Label", "Pays", "Tags", "Date Ajout"];
    
    // Construction des lignes
    const rows = maCollection.map(v => [
        `"${v.artiste.replace(/"/g, '""')}"`,
        `"${v.titre.split(" – ").pop().replace(/"/g, '""')}"`,
        v.anneeOriginale || v.annee || "N/A",
        `"${(v.label || "").replace(/"/g, '""')}"`,
        `"${(v.pays || "").replace(/"/g, '""')}"`,
        `"${(v.tags || []).join(', ')}"`,
        v.dateAjout.split('T')[0]
    ]);

    // Assemblage final
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    // Création du lien de téléchargement
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `ma_collection_vinyles_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    
    link.click();
    document.body.removeChild(link);
    showToast("Export CSV réussi !");
}

// ===================================
// EXPORT DES FONCTIONS GLOBALES
// ===================================
// Les fonctions appelées depuis le HTML doivent être dans le scope global
window.search = search;
window.saveToCollection = saveToCollection;
window.confirmerSuppression = confirmerSuppression;
window.supprimerVinyle = supprimerVinyle;
window.ouvrirGestionTags = ouvrirGestionTags;
window.ajouterTag = ajouterTag;
window.ajouterTagRapide = ajouterTagRapide;
window.retirerTag = retirerTag;
window.fermerModal = fermerModal;
window.changerTri = changerTri;
window.changerFiltre = changerFiltre;
window.changerFiltreTag = changerFiltreTag;
window.reinitialiserFiltres = reinitialiserFiltres;
window.toggleScanner = toggleScanner;
window.exporterCSV = exporterCSV;