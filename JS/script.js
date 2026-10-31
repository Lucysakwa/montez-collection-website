/* ===== Product Data ===== */
const WHATSAPP_NUMBER = '254799403497';
const LOCATION = 'Kahawa Wendani, Nairobi';

const defaultProducts = [];

const PRODUCTS_STORAGE_KEY = 'fashionBeautyProducts';
const ADMIN_SESSION_KEY = 'fashionBeautyAdminAuthed';
const ADMIN_PASSWORD = 'Trademark17323';
const SUPABASE_TABLE_PRODUCTS = 'products';
let isAdminClient = false;
let supabaseReady = false;
let supabaseClient = null;
let supabaseStorageBucket = 'product-images';

function initAdminAccess() {
    const params = new URLSearchParams(window.location.search);
    const requestedAdmin = params.get('admin') === '1';
    const sessionAuthed = isAdminSessionActive();

    if (requestedAdmin && !sessionAuthed) {
        params.delete('admin');
        const cleanedQuery = params.toString();
        const cleanedUrl = `${window.location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', cleanedUrl);
        window.alert('Admin session not active. Use Admin Login to continue.');
    }

    isAdminClient = sessionAuthed;
}

function isAdminSessionActive() {
    try {
        if (localStorage.getItem(ADMIN_SESSION_KEY) === '1') {
            return true;
        }
    } catch (error) {
        /* Ignore localStorage access errors. */
    }

    try {
        return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function setAdminSessionActive(isActive) {
    try {
        if (isActive) {
            localStorage.setItem(ADMIN_SESSION_KEY, '1');
        } else {
            localStorage.removeItem(ADMIN_SESSION_KEY);
        }
    } catch (error) {
        /* Ignore localStorage access errors. */
    }

    try {
        if (isActive) {
            sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
        } else {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
        }
    } catch (error) {
        /* Ignore sessionStorage access errors. */
    }
}

function setAdminQueryParam(isEnabled) {
    const params = new URLSearchParams(window.location.search);
    if (isEnabled) {
        params.set('admin', '1');
    } else {
        params.delete('admin');
    }

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
}

function requestAdminLogin() {
    const enteredPassword = window.prompt('Enter admin password');
    if (enteredPassword !== ADMIN_PASSWORD) {
        window.alert('Incorrect password.');
        return false;
    }

    setAdminSessionActive(true);
    setAdminQueryParam(true);
    isAdminClient = true;
    applyRoleAccess();
    return true;
}

function logoutAdmin() {
    setAdminSessionActive(false);
    setAdminQueryParam(false);
    isAdminClient = false;
    applyRoleAccess();
}

function updateAdminAccessButton() {
    const adminAccessBtn = document.getElementById('adminAccessBtn');
    if (!adminAccessBtn) return;

    if (isAdminClient) {
        adminAccessBtn.textContent = 'Admin Logout';
        adminAccessBtn.classList.add('active');
    } else {
        adminAccessBtn.textContent = 'Admin Login';
        adminAccessBtn.classList.remove('active');
    }
}

function loadProducts() {
    try {
        if (typeof localStorage === 'undefined') {
            return [...defaultProducts];
        }
        const stored = localStorage.getItem(PRODUCTS_STORAGE_KEY);
        if (!stored) {
            return [...defaultProducts];
        }

        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) && parsed.length ? parsed : [...defaultProducts];
    } catch (error) {
        return [...defaultProducts];
    }
}

function saveProducts() {
    try {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
    } catch (error) {
        /* Ignore storage limits or browser restrictions. */
    }
}

function initSupabase() {
    const supabaseConfig = window.SUPABASE_CONFIG || {
        url: '',
        anonKey: '',
        storageBucket: 'product-images'
    };

    const hasConfig = supabaseConfig.url && supabaseConfig.anonKey && window.supabase && typeof window.supabase.createClient === 'function';
    if (!hasConfig) {
        supabaseReady = false;
        return;
    }

    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
    supabaseStorageBucket = supabaseConfig.storageBucket || 'product-images';
    supabaseReady = true;
}

function normalizeSupabaseProduct(row) {
    let qualities = row.qualities;
    if (typeof qualities === 'string') {
        try {
            qualities = JSON.parse(qualities);
        } catch (error) {
            qualities = [];
        }
    }

    if (!Array.isArray(qualities)) {
        qualities = [];
    }

    return {
        id: Number(row.id),
        name: row.name,
        price: row.price,
        priceNum: Number(row.price_num) || 0,
        qualities: qualities,
        image: row.image,
        badge: row.badge || null,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    };
}

async function fetchProductsFromSupabase() {
    if (!supabaseReady) return null;

    const { data, error } = await supabaseClient
        .from(SUPABASE_TABLE_PRODUCTS)
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    if (!data || !data.length) {
        return [];
    }

    return data
        .map(normalizeSupabaseProduct)
        .filter(product => Number.isFinite(product.id));
}

async function upsertProductInSupabase(product) {
    if (!supabaseReady) return;

    const payload = {
        id: product.id,
        name: product.name,
        price: product.price,
        price_num: product.priceNum,
        qualities: product.qualities,
        image: product.image,
        badge: product.badge || null,
        created_at: product.createdAt ? new Date(product.createdAt).toISOString() : new Date().toISOString()
    };

    const { error } = await supabaseClient
        .from(SUPABASE_TABLE_PRODUCTS)
        .upsert(payload, { onConflict: 'id' });

    if (error) {
        throw error;
    }
}

async function deleteProductFromSupabase(productId) {
    if (!supabaseReady) {
        throw new Error('Supabase is not connected.');
    }

    const numericId = Number(productId);
    if (!Number.isFinite(numericId)) {
        throw new Error('Invalid product id for deletion.');
    }

    const { data, error } = await supabaseClient
        .from(SUPABASE_TABLE_PRODUCTS)
        .delete()
        .eq('id', numericId)
        .select('id');

    if (error) {
        throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No matching product was deleted in Supabase.');
    }
}

async function uploadImageToSupabase(file, productId) {
    if (!supabaseReady || !file) return null;

    const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `products/${productId}-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabaseClient.storage
        .from(supabaseStorageBucket)
        .upload(path, file, {
            upsert: true,
            contentType: file.type || 'application/octet-stream'
        });

    if (uploadError) {
        throw uploadError;
    }

    const { data } = supabaseClient.storage.from(supabaseStorageBucket).getPublicUrl(path);
    return data.publicUrl || null;
}

async function hydrateProducts() {
    const localProducts = loadProducts();

    try {
        initSupabase();

        if (!supabaseReady) {
            products = localProducts;
            nextId = products.reduce((maxId, product) => Math.max(maxId, product.id || 0), 0) + 1;
            return;
        }

        const cloudProducts = await fetchProductsFromSupabase();

        products = cloudProducts || [];
        saveProducts();

        nextId = products.reduce((maxId, product) => Math.max(maxId, product.id || 0), 0) + 1;
    } catch (error) {
        supabaseReady = false;
        products = localProducts;
        nextId = products.reduce((maxId, product) => Math.max(maxId, product.id || 0), 0) + 1;
        showToast('Supabase not available. Running in local mode.', 'error');
    }
}

let products = loadProducts();
let nextId = products.reduce((maxId, product) => Math.max(maxId, product.id || 0), 0) + 1;
let editingProductId = null;

/* ===== DOM References ===== */
const productGrid = document.getElementById('productGrid');
const uploadModal = document.getElementById('uploadModal');
const detailModal = document.getElementById('detailModal');
const uploadForm = document.getElementById('uploadForm');
const montezPanel = document.getElementById('montezPanel');
const montezToggle = document.getElementById('montezToggle');
const montezMessages = document.getElementById('montezMessages');
const montezForm = document.getElementById('montezForm');
const montezInput = document.getElementById('montezInput');
const montezSuggestions = document.getElementById('montezSuggestions');
const navLinks = document.getElementById('navLinks');
const hamburger = document.getElementById('hamburger');
const navbar = document.getElementById('navbar');
const adminAccessBtn = document.getElementById('adminAccessBtn');

function applyRoleAccess() {
    const collectionActions = document.querySelector('.collection-actions');
    if (collectionActions) {
        collectionActions.style.display = isAdminClient ? 'flex' : 'none';
    }
    updateAdminAccessButton();
}

if (adminAccessBtn) {
    adminAccessBtn.addEventListener('click', () => {
        if (isAdminClient) {
            logoutAdmin();
            return;
        }
        requestAdminLogin();
    });
}

/* ===== Loading Screen ===== */
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
    }, 1800);
});

/* ===== Navbar Scroll ===== */
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    navbar.classList.toggle('scrolled', scrollY > 60);
    lastScroll = scrollY;
});

/* ===== Hamburger Menu ===== */
hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
});
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
    });
});

/* ===== Render Products ===== */
function renderProducts() {
    productGrid.innerHTML = '';
    products.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.transitionDelay = `${index * 0.08}s`;

        const qualitiesHTML = product.qualities
            .map(q => `<li>${q}</li>`)
            .join('');

        const badgeHTML = product.badge
            ? `<span class="product-badge">${product.badge}</span>`
            : '';

        const whatsappURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hi Lucy! I'm interested in the "${product.name}" (${product.price}) from Fashion and Beauty. Location: ${LOCATION}.`
        )}`;

        card.innerHTML = `
            <div class="product-card-image" data-id="${product.id}">
                ${badgeHTML}
                <img src="${product.image}" alt="${product.name}" loading="lazy"
                     onerror="this.src='https://picsum.photos/seed/fallback${product.id}/600/600.jpg'">
            </div>
            <div class="product-card-body">
                <h3 class="product-card-name">${product.name}</h3>
                <p class="product-card-price">${product.price}</p>
                <ul class="product-qualities">${qualitiesHTML}</ul>
                <div class="product-card-actions">
                    <a href="${whatsappURL}" target="_blank" class="btn btn-whatsapp">
                        <i class="fab fa-whatsapp"></i> Order
                    </a>
                    <button class="btn btn-outline" data-id="${product.id}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    ${isAdminClient ? `
                    <button class="btn btn-outline" data-action="replace" data-id="${product.id}">
                        <i class="fas fa-pen-to-square"></i> Replace
                    </button>
                    <button class="btn btn-danger" data-action="delete" data-id="${product.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    ` : ''}
                </div>
            </div>
        `;

        productGrid.appendChild(card);

        /* Observe for reveal animation */
        setTimeout(() => {
            card.classList.add('visible');
        }, 100 + index * 80);
    });

}

productGrid.addEventListener('click', (event) => {
    const target = event.target.closest('[data-id]');
    if (!target) return;

    const productId = parseInt(target.dataset.id, 10);
    const action = target.dataset.action;

    if (action === 'delete') {
        if (!isAdminClient) return;
        handleDeleteProduct(productId);
        return;
    }

    if (action === 'replace') {
        if (!isAdminClient) return;
        openEditProduct(productId);
        return;
    }

    if (target.classList.contains('product-card-image') || target.closest('.product-card-image')) {
        openDetail(productId);
        return;
    }

    if (target.classList.contains('btn-outline')) {
        openDetail(productId);
    }
});

async function handleDeleteProduct(id) {
    if (!isAdminClient) return;

    const product = products.find(item => item.id === id);
    if (!product) return;

    const confirmed = window.confirm(`Delete "${product.name}" from the collection?`);
    if (!confirmed) return;

    try {
        await deleteProductFromSupabase(id);
        products = products.filter(item => item.id !== id);
        saveProducts();
        renderProducts();
        showToast(`"${product.name}" deleted from collection.`, 'success');
    } catch (error) {
        showToast('Cloud delete failed. Item was not removed.', 'error');
    }
}

function openEditProduct(id) {
    if (!isAdminClient) return;

    const product = products.find(item => item.id === id);
    if (!product) return;

    editingProductId = id;
    document.getElementById('uploadModalTitle').textContent = 'Replace Product';
    document.getElementById('uploadSubmitBtn').innerHTML = '<i class="fas fa-pen-to-square"></i> Save Changes';
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodPrice').value = product.priceNum;
    document.getElementById('prodQualities').value = product.qualities.join('\n');

    uploadedImageData = product.image;
    imagePreview.src = product.image;
    imagePreview.classList.add('visible');
    fileDropContent.style.display = 'none';

    uploadModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/* ===== Product Detail Modal ===== */
function openDetail(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('detailImg').src = product.image;
    document.getElementById('detailImg').alt = product.name;
    document.getElementById('detailName').textContent = product.name;
    document.getElementById('detailPrice').textContent = product.price;

    const qualitiesList = document.getElementById('detailQualities');
    qualitiesList.innerHTML = product.qualities.map(q => `<li>${q}</li>`).join('');

    const whatsappURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `Hi Lucy! I'm interested in the "${product.name}" (${product.price}) from Fashion and Beauty. Location: ${LOCATION}.`
    )}`;
    document.getElementById('detailWhatsapp').href = whatsappURL;

    detailModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

document.getElementById('closeDetailModal').addEventListener('click', () => {
    detailModal.classList.remove('active');
    document.body.style.overflow = '';
});
detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
        detailModal.classList.remove('active');
        document.body.style.overflow = '';
    }
});

/* ===== Upload Modal ===== */
document.getElementById('openUploadModal').addEventListener('click', () => {
    if (!isAdminClient) {
        showToast('Only admins can add products.', 'error');
        return;
    }
    uploadModal.classList.add('active');
    document.body.style.overflow = 'hidden';
});
document.getElementById('closeUploadModal').addEventListener('click', () => {
    uploadModal.classList.remove('active');
    document.body.style.overflow = '';
    resetUploadForm();
});
uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) {
        uploadModal.classList.remove('active');
        document.body.style.overflow = '';
        resetUploadForm();
    }
});

let uploadedImageData = null;
let uploadedImageFile = null;

const fileDrop = document.getElementById('fileDrop');
const prodImage = document.getElementById('prodImage');
const fileDropContent = document.getElementById('fileDropContent');
const imagePreview = document.getElementById('imagePreview');

fileDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDrop.classList.add('dragover');
});
fileDrop.addEventListener('dragleave', () => {
    fileDrop.classList.remove('dragover');
});
fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDrop.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFileUpload(e.dataTransfer.files[0]);
    }
});
prodImage.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileUpload(e.target.files[0]);
    }
});

function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file.', 'error');
        return;
    }
    uploadedImageFile = file;
    uploadedImageData = null;
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.classList.add('visible');
    fileDropContent.style.display = 'none';
}

function resetUploadForm() {
    uploadForm.reset();
    uploadedImageData = null;
    uploadedImageFile = null;
    editingProductId = null;
    document.getElementById('uploadModalTitle').textContent = 'Add New Product';
    document.getElementById('uploadSubmitBtn').innerHTML = '<i class="fas fa-plus"></i> Add to Collection';
    imagePreview.classList.remove('visible');
    imagePreview.src = '';
    fileDropContent.style.display = '';
}

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isAdminClient) {
        showToast('Only admins can add products.', 'error');
        return;
    }

    const name = document.getElementById('prodName').value.trim();
    const price = document.getElementById('prodPrice').value.trim();
    const qualitiesRaw = document.getElementById('prodQualities').value.trim();

    if (!name || !price || !qualitiesRaw) {
        showToast('Please fill in all fields.', 'error');
        return;
    }

    const qualities = qualitiesRaw
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);

    if (qualities.length === 0) {
        showToast('Please add at least one quality.', 'error');
        return;
    }

    const priceValue = parseInt(price, 10);

    if (editingProductId !== null) {
        const productIndex = products.findIndex(item => item.id === editingProductId);
        if (productIndex === -1) {
            showToast('The selected product could not be found.', 'error');
            return;
        }

        let image = products[productIndex].image;
        if (uploadedImageFile) {
            try {
                const remoteUrl = await uploadImageToSupabase(uploadedImageFile, editingProductId);
                image = remoteUrl || imagePreview.src;
            } catch (error) {
                image = imagePreview.src || image;
                showToast('Image upload failed. Using local image preview.', 'error');
            }
        } else if (uploadedImageData) {
            image = uploadedImageData;
        }

        products[productIndex] = {
            ...products[productIndex],
            name: name,
            price: `KSh ${priceValue.toLocaleString()}`,
            priceNum: priceValue,
            qualities: qualities,
            image: image,
            createdAt: products[productIndex].createdAt || Date.now()
        };

        try {
            await upsertProductInSupabase(products[productIndex]);
        } catch (error) {
            showToast('Cloud sync failed. Changes saved locally only.', 'error');
        }

        showToast(`"${name}" updated successfully!`, 'success');
    } else {
        const newId = nextId++;
        let image = uploadedImageData || `https://picsum.photos/seed/${Date.now()}/600/600.jpg`;

        if (uploadedImageFile) {
            try {
                const remoteUrl = await uploadImageToSupabase(uploadedImageFile, newId);
                image = remoteUrl || imagePreview.src || image;
            } catch (error) {
                image = imagePreview.src || image;
                showToast('Image upload failed. Using local image preview.', 'error');
            }
        }

        const newProduct = {
            id: newId,
            name: name,
            price: `KSh ${priceValue.toLocaleString()}`,
            priceNum: priceValue,
            qualities: qualities,
            image: image,
            badge: 'New',
            createdAt: Date.now()
        };

        products.unshift(newProduct);

        try {
            await upsertProductInSupabase(newProduct);
        } catch (error) {
            showToast('Cloud sync failed. Product saved locally only.', 'error');
        }

        showToast(`"${name}" added to collection!`, 'success');
    }

    saveProducts();
    renderProducts();

    uploadModal.classList.remove('active');
    document.body.style.overflow = '';
    resetUploadForm();

    /* Scroll to collection */
    document.getElementById('collection').scrollIntoView({ behavior: 'smooth' });
});

/* ===== Toast Notifications ===== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

/* ===== Montez AI ===== */
const montezKnowledge = {
    greeting: [
        "Welcome to Fashion and Beauty by Lucy Jahenda! I'm Montez, your personal style advisor. How can I help you today?",
        "Hey there, gorgeous! I'm Montez — your go-to guide for everything Fashion and Beauty. What are you looking for?"
    ],
    products: "Our collection features handpicked premium pieces: designer sneakers (including Nike editions), luxury gold-dial timepieces, genuine leather bags, 18K gold-plated jewelry, and designer sunglasses. Every item is personally curated by Lucy Jahenda for quality and style. Want details on a specific piece?",
    prices: "Our prices range from KSh 3,200 for elegant jewelry to KSh 12,000 for our luxury timepieces. We believe premium quality should be accessible. Here's a quick look:\n\n• Sneakers: KSh 4,500 – KSh 8,500\n• Timepiece: KSh 12,000\n• Leather Bag: KSh 6,800\n• Gold Necklace: KSh 3,200\n• Sunglasses: KSh 5,500",
    location: "We're located at Kahawa Wendani, Nairobi, Kenya. You're always welcome to visit and experience our collection in person! We're open Mon–Sat 8AM–7PM and Sundays 10AM–5PM. Need directions? Click 'Get Directions' in our Location section!",
    delivery: "Absolutely! We deliver across Nairobi and beyond. Place your order via WhatsApp, and we'll arrange delivery right to your doorstep. Delivery fees vary by location — we'll confirm the cost before dispatching.",
    lucy: "Lucy Jahenda is the heart and soul of Fashion and Beauty. With an impeccable eye for style and a passion for helping people feel extraordinary, she personally sources every item in our collection. Her mission is simple: make premium fashion accessible to everyone who dares to stand out.",
    returns: "We stand behind our products 100%. If you have any concerns, reach out via WhatsApp within 48 hours of receiving your order. We'll work with you to find the perfect solution — your satisfaction is our priority.",
    hours: "Our store hours:\n\n• Monday – Saturday: 8:00 AM – 7:00 PM\n• Sunday: 10:00 AM – 5:00 PM\n\nYou can also reach us on WhatsApp anytime — we typically respond within minutes during business hours!",
    wholesale: "Yes, we offer wholesale pricing on select items! For bulk orders, contact Lucy directly on WhatsApp at +254 799 403 497. She'll work with you on pricing and availability for larger quantities.",
    payment: "We accept M-Pesa (the most popular option!), bank transfers, and cash on delivery for Nairobi orders. All payments are confirmed before dispatch to ensure a smooth, secure transaction.",
    social: "Stay connected with us!\n\n• TikTok: @dj.kuse — follow for styling tips, new drops, and behind-the-scenes content\n• WhatsApp Channel: Join for exclusive deals and early access to new arrivals\n\nLinks are in our Connect section!",
    watch: "Our Luxury Gold Dial Timepiece is a bestseller at KSh 12,000. It features an authentic gold-finished dial, premium black leather strap, water-resistant construction, and precision quartz movement. It's the perfect statement piece for any occasion. Order via WhatsApp to secure yours!",
    sneakers: "We have incredible sneaker options! The Classic Monochrome Sneakers (KSh 4,500) are perfect for everyday versatility, while the Nike Air Emerald Gold Edition (KSh 8,500) is a limited-edition head-turner with its white, green, and gold design. Both offer premium comfort and style.",
    bag: "Our Premium Leather Crossbody Bag at KSh 6,800 is crafted from genuine leather with gold-tone hardware. It features an adjustable strap and multiple compartments — perfect for the modern, organized woman on the go.",
    jewelry: "Our Elegant Gold Chain Necklace at KSh 3,200 is a customer favorite. It's 18K gold-plated on stainless steel, hypoallergenic, tarnish-free, and features a delicate layered design. It elevates any outfit instantly!",
    sunglasses: "Our Designer Aviator Sunglasses at KSh 5,500 feature UV400 polarized lenses, a lightweight titanium frame, and come with a premium carry case. Classic aviator style that never goes out of fashion.",
    services: "At Fashion and Beauty, we offer:\n\n• Curated premium fashion & accessories\n• Personal styling consultations\n• Fast & reliable delivery\n• Wholesale options\n• Authenticity guarantee on every item\n\nWe're more than a store — we're your style partner.",
    thanks: [
        "You're welcome! Remember, at Fashion and Beauty, we believe everyone deserves to feel extraordinary. Don't hesitate to reach out anytime!",
        "My pleasure! If you need anything else, I'm right here. And don't forget to follow us on TikTok @dj.kuse and join our WhatsApp Channel for exclusive updates!"
    ]
};

function getMontezResponse(message) {
    const msg = message.toLowerCase();

    /* Greeting patterns */
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|what'?s up)/.test(msg)) {
        return pickRandom(montezKnowledge.greeting);
    }

    /* Thanks */
    if (/thank|thanks|thankyou|asante/.test(msg)) {
        return pickRandom(montezKnowledge.thanks);
    }

    /* Products / what do you have / collection */
    if (/product|collection|what do you (have|sell|offer)|items|catalogue|catalog|stock|available/.test(msg)) {
        return montezKnowledge.products;
    }

    /* Prices / cost / how much */
    if (/price|cost|how much|expensive|cheap|afford|budget|rate/.test(msg)) {
        return montezKnowledge.prices;
    }

    /* Location / where */
    if (/where|location|address|find you|visit|store|shop|located|direction/.test(msg)) {
        return montezKnowledge.location;
    }

    /* Delivery / shipping */
    if (/deliver|shipping|ship|send|come to me|drop/.test(msg)) {
        return montezKnowledge.delivery;
    }

    /* About Lucy */
    if (/lucy|jahenda|owner|founder|who (is|runs|started)/.test(msg)) {
        return montezKnowledge.lucy;
    }

    /* Returns / refund */
    if (/return|refund|exchange|not happy|complain|wrong/.test(msg)) {
        return montezKnowledge.returns;
    }

    /* Hours / working time */
    if (/hour|open|close|time|when|working|schedule/.test(msg)) {
        return montezKnowledge.hours;
    }

    /* Wholesale / bulk */
    if (/wholesale|bulk|many|resell|business|partner/.test(msg)) {
        return montezKnowledge.wholesale;
    }

    /* Payment / M-Pesa */
    if (/pay|payment|mpesa|m-pesa|cash|bank|money/.test(msg)) {
        return montezKnowledge.payment;
    }

    /* Social / TikTok / WhatsApp */
    if (/social|tiktok|whatsapp channel|follow|instagram|facebook|online/.test(msg)) {
        return montezKnowledge.social;
    }

    /* Watch */
    if (/watch|timepiece|clock|wrist/.test(msg)) {
        return montezKnowledge.watch;
    }

    /* Sneakers / shoes */
    if (/sneaker|shoe|nike|air|trainer|footwear/.test(msg)) {
        return montezKnowledge.sneakers;
    }

    /* Bag */
    if (/bag|crossbody|handbag|purse|leather bag/.test(msg)) {
        return montezKnowledge.bag;
    }

    /* Jewelry / necklace */
    if (/jewel|necklace|chain|ring|bracelet|gold|accessor/.test(msg)) {
        return montezKnowledge.jewelry;
    }

    /* Sunglasses */
    if (/sunglass|shade|aviator|glasses|eyewear/.test(msg)) {
        return montezKnowledge.sunglasses;
    }

    /* Services */
    if (/service|what (do you|can you)|help|offer/.test(msg)) {
        return montezKnowledge.services;
    }

    /* Fallback */
    return "That's a great question! While I may not have the exact answer, I can help you with our products, pricing, location, delivery, payment methods, or anything about Lucy Jahenda and Fashion and Beauty. You can also reach Lucy directly on WhatsApp at +254 799 403 497 for personalized assistance!";
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/* Montez panel toggle */
montezToggle.addEventListener('click', () => {
    montezToggle.classList.toggle('active');
    montezPanel.classList.toggle('active');

    /* Initial greeting */
    if (montezMessages.children.length === 0) {
        setTimeout(() => {
            addBotMessage("Hello! I'm Montez, your personal style advisor at Fashion and Beauty by Lucy Jahenda. Ask me about our products, prices, location, delivery, or anything else. How can I help you look extraordinary today?");
        }, 400);
    }
});

document.getElementById('montezClose').addEventListener('click', () => {
    montezToggle.classList.remove('active');
    montezPanel.classList.remove('active');
});

/* Add message bubbles */
function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'montez-msg user';
    div.textContent = text;
    montezMessages.appendChild(div);
    montezMessages.scrollTop = montezMessages.scrollHeight;
}

function addBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'montez-msg bot';
    div.style.whiteSpace = 'pre-line';
    div.textContent = text;
    montezMessages.appendChild(div);
    montezMessages.scrollTop = montezMessages.scrollHeight;
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'montez-typing';
    div.id = 'typingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    montezMessages.appendChild(div);
    montezMessages.scrollTop = montezMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

/* Handle form submit */
montezForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = montezInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    montezInput.value = '';
    montezSuggestions.style.display = 'none';

    showTypingIndicator();

    const delay = 800 + Math.random() * 1200;
    setTimeout(() => {
        removeTypingIndicator();
        const response = getMontezResponse(text);
        addBotMessage(response);
    }, delay);
});

/* Suggestion buttons */
document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        montezInput.value = msg;
        montezForm.dispatchEvent(new Event('submit'));
    });
});

/* ===== Hero Canvas — Gold Particles ===== */
function initHeroCanvas() {
    const canvas = document.getElementById('heroCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    /* Create particles */
    const PARTICLE_COUNT = 60;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.5,
            speedX: (Math.random() - 0.5) * 0.3,
            speedY: (Math.random() - 0.5) * 0.3,
            opacity: Math.random() * 0.5 + 0.1,
            pulse: Math.random() * Math.PI * 2
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;
            p.pulse += 0.01;

            /* Wrap around */
            if (p.x < -10) p.x = canvas.width + 10;
            if (p.x > canvas.width + 10) p.x = -10;
            if (p.y < -10) p.y = canvas.height + 10;
            if (p.y > canvas.height + 10) p.y = -10;

            const currentOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));
            const r = 200, g = 164, b = 92;

            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${currentOpacity})`;
            ctx.fill();

            /* Glow */
            if (p.size > 1) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.5, p.size * 3), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},${currentOpacity * 0.1})`;
                ctx.fill();
            }
        });

        animId = requestAnimationFrame(draw);
    }

    /* Respect reduced motion */
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduced) {
        draw();
    } else {
        /* Draw one static frame */
        draw();
        cancelAnimationFrame(animId);
    }
}

/* ===== Scroll Reveal (IntersectionObserver) ===== */
function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.15 });

    reveals.forEach(el => observer.observe(el));
}

/* ===== Add reveal class to sections ===== */
function addRevealClasses() {
    document.querySelectorAll('.section-header, .about-visual, .about-content, .location-card, .connect-card, .footer-brand, .footer-links').forEach(el => {
        el.classList.add('reveal');
    });
}

/* ===== Initialize Everything ===== */
document.addEventListener('DOMContentLoaded', async () => {
    initAdminAccess();
    applyRoleAccess();
    await hydrateProducts();
    renderProducts();
    initHeroCanvas();
    addRevealClasses();
    initScrollReveal();
});