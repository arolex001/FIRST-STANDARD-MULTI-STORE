

let cart = [];

try {
    const savedCart = JSON.parse(localStorage.getItem("firstStandardCart"));

    if (Array.isArray(savedCart)) {
        cart = savedCart.filter((item) =>
            item &&
            typeof item.name === "string" &&
            Number.isFinite(item.price) &&
            item.price >= 0 &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0
        );
    }
} catch (error) {
    cart = [];
}


const shopWhatsApp = "2348127276790";

const cartCount = document.querySelector(".cart-count");
const addToCartButtons = document.querySelectorAll(".add-to-cart");
const cartLink = document.querySelector(".cart-link");

addToCartButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const productCard = button.closest(".product-card");

        const name = productCard.querySelector("h3").textContent;
        const priceText = productCard.querySelector(".product-price").textContent;
        const price = Number(priceText.replace(/[₦,\s]/g, ""));

        const existingItem = cart.find((item) => item.name === name);

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                name: name,
                price: price,
                quantity: 1
            });
        }

        updateCartCount();
        saveCart();

        button.textContent = "Added ✓";

        setTimeout(() => {
            button.textContent = "Add to Cart";
        }, 1000);
    });
});



function updateCartCount() {
    const totalItems = cart.reduce((total, item) => {
        return total + item.quantity;
    }, 0);

    if (cartCount) {
        cartCount.textContent = totalItems;
    }
}


function saveCart() {
    try {
        localStorage.setItem("firstStandardCart", JSON.stringify(cart));
    } catch (error) {
        console.error("Could not save the shopping cart.", error);
    }
}


async function calculateBestDiscount(items) {
    const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    const { data: settingsData, error: settingsError } =
        await window.storeSupabaseClient
            .from("store_settings")
            .select("setting_key, setting_value")
            .in("setting_key", [
                "bulk_discount_enabled",
                "bulk_discount_percent",
                "bulk_discount_min_quantity"
            ]);

    if (settingsError) throw settingsError;

    const settings = {};

    (settingsData || []).forEach((setting) => {
        settings[setting.setting_key] = setting.setting_value;
    });

    const percentageEnabled =
        settings.bulk_discount_enabled === true;

    const percentage = Number(
        settings.bulk_discount_percent ?? 5
    );

    const percentageMinimum = Number(
        settings.bulk_discount_min_quantity ?? 5
    );

    if (
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100 ||
        !Number.isInteger(percentageMinimum) ||
        percentageMinimum < 1
    ) {
        throw new Error("Invalid percentage discount settings.");
    }

    const { data: offers, error: offersError } =
        await window.storeSupabaseClient
            .from("discount_offers")
            .select(
                "id, offer_name, discount_per_item, minimum_quantity, applies_to_all_products, product_ids"
            )
            .eq("is_active", true);

    if (offersError) throw offersError;

    const productGroups = new Map();

    items.forEach((item) => {
        const productId = Number(item.product_id);

        if (!productGroups.has(productId)) {
            productGroups.set(productId, {
                quantity: 0,
                subtotal: 0
            });
        }

        const group = productGroups.get(productId);

        group.quantity += Number(item.quantity);
        group.subtotal += Number(item.price) * Number(item.quantity);
    });

    let totalDiscount = 0;
    const discountDetails = [];

    productGroups.forEach((group, productId) => {
        let percentageSaving = 0;
        let fixedSaving = 0;
        let selectedOffer = null;

        if (
            percentageEnabled &&
            group.quantity >= percentageMinimum
        ) {
            percentageSaving =
                group.subtotal * percentage / 100;
        }

        (offers || []).forEach((offer) => {
            const minimum = Number(offer.minimum_quantity);
            const amount = Number(offer.discount_per_item);

            const appliesToProduct =
                offer.applies_to_all_products === true ||
                (offer.product_ids || []).map(Number).includes(productId);

            if (
                appliesToProduct &&
                group.quantity >= minimum &&
                Number.isFinite(amount) &&
                amount > 0
            ) {
                const possibleSaving = Math.min(
                    group.subtotal,
                    amount * group.quantity
                );

                if (possibleSaving > fixedSaving) {
                    fixedSaving = possibleSaving;
                    selectedOffer = offer.offer_name;
                }
            }
        });

        const chosenDiscount = Math.min(
            group.subtotal,
            Math.max(percentageSaving, fixedSaving)
        );

        totalDiscount += chosenDiscount;

        discountDetails.push({
            product_id: productId,
            quantity: group.quantity,
            percentage_saving: percentageSaving,
            fixed_saving: fixedSaving,
            applied_discount: chosenDiscount,
            applied_offer: fixedSaving > percentageSaving
                ? selectedOffer
                : percentageSaving > 0
                    ? percentage + "% bulk discount"
                    : null
        });
    });

    totalDiscount = Math.round(
        (totalDiscount + Number.EPSILON) * 100
    ) / 100;

    const finalTotal = Math.round(
        (subtotal - totalDiscount + Number.EPSILON) * 100
    ) / 100;

    return {
        subtotal,
        discount: totalDiscount,
        total: finalTotal,
        details: discountDetails
    };
}


async function processOrder() {
    if (cart.length === 0) {
        alert("Your cart is empty. Please add a product first.");
        return;
    }

    let deliveryAddress;

    try {
        const savedAddressText = localStorage.getItem(
            "firstStandardDeliveryAddress"
        );

        if (!savedAddressText) {
            alert("Please save your delivery address before placing your order.");
            return;
        }

        deliveryAddress = JSON.parse(savedAddressText);
    } catch (error) {
        alert("Could not read your delivery address. Please save it again.");
        return;
    }

    if (
        !deliveryAddress.state ||
        !deliveryAddress.city ||
        !deliveryAddress.area ||
        !deliveryAddress.street ||
        !deliveryAddress.phone
    ) {
        alert("Please open your delivery address form and save all address details, including your state.");
        return;
    }


    // Check the latest stock before saving the order.
    if (!window.storeSupabaseClient) {
        alert("Store connection is not ready. Please refresh and try again.");
        return;
    }

    const { data: currentProducts, error: stockError } =
        await window.storeSupabaseClient
            .from("products")
            .select("name, stock_quantity")
            .in("name", cart.map((item) => item.name));

    if (stockError) {
        console.error("Stock check failed:", stockError);
        alert("We could not verify stock. Please try again.");
        return;
    }

    for (const item of cart) {
        const product = (currentProducts || []).find(
            (product) => product.name === item.name
        );

        // Skip older storefront products not managed in Supabase.
        if (!product) continue;

        const availableStock = Number(product.stock_quantity ?? 0);

        if (availableStock < item.quantity) {
            alert(
                availableStock === 0
                    ? item.name + " is now out of stock."
                    : "Only " + availableStock + " unit(s) of " +
                      item.name + " are available."
            );
            return;
        }
    }



    // Prepare order items for the secure server-side checkout.
    const orderItems = cart.map((item) => ({
    product_id: Number(item.product_id),
    name: item.name,
    price: Number(item.price),
    quantity: Number(item.quantity),
    selected_colour: item.selected_colour || null
}));

    if (orderItems.some((item) =>
        !Number.isInteger(item.product_id) ||
        item.product_id <= 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.price) ||
        item.price < 0
    )) {
        alert(
            "One or more cart items need to be added again. " +
            "Please remove the affected items and add them again."
        );
        return;
    }

    

let discountResult;

try {
    discountResult = await calculateBestDiscount(orderItems);
} catch (error) {
    console.error("Could not calculate the current discounts:", error);
    alert("We could not calculate the current discounts. Please try again.");
    return;
}

const orderTotal = discountResult.total;



    const functionURL =
        SUPABASE_URL.replace(/\/$/, "") +
        "/functions/v1/smart-action";

    let response;
    let savedOrder;

    try {
        
const client = window.storeSupabaseClient ||
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

const { data: sessionData, error: sessionError } =
    await client.auth.getSession();

if (sessionError) {
    throw sessionError;
}

const accessToken = sessionData.session?.access_token;

response = await fetch(functionURL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " +
            (accessToken || SUPABASE_PUBLISHABLE_KEY)
    },
    body: JSON.stringify({
        items: orderItems,
        total: orderTotal,
        delivery_address: deliveryAddress
    })
});


        savedOrder = await response.json();
    } catch (error) {
        console.error("Checkout request failed:", error);
        alert("We could not contact the checkout service. Please try again.");
        return;
    }

    if (!response.ok || !savedOrder || savedOrder.success !== true) {
        console.error("Checkout was not confirmed:", savedOrder);
        alert(
            savedOrder?.message ||
            "We could not confirm your order. Please try again."
        );
        return;
    }



    

    // Website-only order confirmation.
    alert(
        "YOUR ORDER HAS BEEN SAVED\n\n" +
        "Order number: " + savedOrder.order_number + "\n\n" +
        "PAYMENT\n" +
        "Online payment via Paystack will be available " +
        "once payment setup is complete.\n\n" +
        "DELIVERY INFORMATION\n" +
        "Our team will contact you to discuss delivery charges " +
        "and arrangements.\n\n" +
        "Your order remains pending until payment is confirmed."
    );

    cart.length = 0;
    saveCart();
    updateCartCount();

    if (cartPanel) {
        cartPanel.hidden = true;
    }

    renderCartPanel();
}

let checkoutMode = "website";
let checkoutInProgress = false;





if (cartLink) {
    cartLink.addEventListener("click", (event) => {
        event.preventDefault();

        if (cartPanel) {
            cartPanel.classList.add("open");
        }
    });
}


const cartPanel = document.querySelector("#cart-panel");
const cartItemsContainer = document.querySelector("#cart-items");
const cartTotalElement = document.querySelector("#cart-total");
const closeCartButton = document.querySelector("#close-cart");




async function renderCartPanel() {
    if (!cartItemsContainer || !cartTotalElement) return;

    cartItemsContainer.innerHTML = "";

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;

        const row = document.createElement("div");
        row.className = "cart-item";

        row.innerHTML = `
            <div>
                <strong>${item.name}</strong>
                ${item.selected_colour
    ? `<p>Colour: ${item.selected_colour}</p>`
    : ""}
                <p>₦${item.price.toLocaleString("en-NG")} each</p>
                <label>
                    Quantity:
                    <input type="number" min="1" step="1"
                        value="${item.quantity}"
                        data-cart-quantity="${index}">
                </label>
            </div>
            <div>
                <strong>₦${itemTotal.toLocaleString("en-NG")}</strong>
                <button type="button" data-remove-cart-item="${index}">
                    Remove
                </button>
            </div>
        `;

        cartItemsContainer.appendChild(row);
    });

    try {
        const supabaseItems = cart.filter(
            item => Number.isInteger(Number(item.product_id)) &&
                    Number(item.product_id) > 0
        );

        const discountResult = await calculateBestDiscount(supabaseItems);

        const otherItemsTotal = cart
            .filter(item => !supabaseItems.includes(item))
            .reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
            );

        const combinedSubtotal =
            discountResult.subtotal + otherItemsTotal;

        const combinedTotal =
            discountResult.total + otherItemsTotal;

        cartTotalElement.innerHTML =
            `Subtotal: ₦${combinedSubtotal.toLocaleString("en-NG")}<br>` +
            `Discount: -₦${discountResult.discount.toLocaleString("en-NG")}<br>` +
            `<strong>Total: ₦${combinedTotal.toLocaleString("en-NG")}</strong>`;

    } catch (error) {
        console.error("Could not calculate cart discounts:", error);

        cartTotalElement.textContent =
            "Could not load discount information. Please try again.";
    }
}



if (cartLink && cartPanel) {
    cartLink.addEventListener("click", (event) => {
        event.preventDefault();
        cartPanel.hidden = false;
        renderCartPanel();
    });
}

if (closeCartButton && cartPanel) {
    closeCartButton.addEventListener("click", () => {
        cartPanel.hidden = true;
    });
}

if (cartItemsContainer) {
    cartItemsContainer.addEventListener("change", (event) => {
        const input = event.target.closest("[data-cart-quantity]");
        if (!input) return;

        const index = Number(input.dataset.cartQuantity);
        const quantity = Number(input.value);

        if (!Number.isInteger(quantity) || quantity < 1 || !cart[index]) {
            renderCartPanel();
            return;
        }

       cart[index].quantity = quantity;
updateCartCount();
saveCart();
renderCartPanel();
    });



    cartItemsContainer.addEventListener("click", (event) => {
        const button = event.target.closest("[data-remove-cart-item]");
        if (!button) return;

        const index = Number(button.dataset.removeCartItem);
       cart.splice(index, 1);
updateCartCount();
saveCart();
renderCartPanel();
    });
}


const websiteCheckoutButton = document.querySelector("#checkout-website");

if (websiteCheckoutButton) {
    websiteCheckoutButton.addEventListener("click", async () => {
        if (checkoutInProgress) return;

        checkoutMode = "website";
        checkoutInProgress = true;
        websiteCheckoutButton.disabled = true;
        websiteCheckoutButton.textContent = "Processing order...";

        try {
            await processOrder();
        } finally {
            checkoutMode = "website";
            checkoutInProgress = false;
            websiteCheckoutButton.disabled = false;
            websiteCheckoutButton.textContent = "Place Website Order";
        }
    });
}





updateCartCount();



const searchForm = document.querySelector("#search-form");
const productSearch = document.querySelector("#product-search");
let productCards = document.querySelectorAll(".product-card");

function filterProducts(searchTerm) {
    const term = searchTerm.trim().toLowerCase();

    productCards.forEach((card) => {
        const productDetails = card.textContent.toLowerCase();
        card.style.display = productDetails.includes(term) ? "" : "none";
    });
}

if (searchForm && productSearch) {
    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        filterProducts(productSearch.value);
    });

    productSearch.addEventListener("input", () => {
        filterProducts(productSearch.value);
    });
}


const categoryNav = document.querySelector(".category-nav");

if (categoryNav) categoryNav.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-category]");

    if (!link) return;

    event.preventDefault();

    const selectedCategory = link.dataset.category.trim().toLowerCase();

    productCards.forEach((card) => {
        const categoryElement = card.querySelector(".product-category");

        const category = categoryElement
            ? categoryElement.textContent.trim().toLowerCase()
            : "";

        card.style.display = category === selectedCategory ? "" : "none";
    });

    if (productSearch) {
        productSearch.value = "";
    }

    document.querySelector(".product-grid").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});


const allProductsLink = document.querySelector("#all-products-link");

if (allProductsLink) {
    allProductsLink.addEventListener("click", (event) => {
        event.preventDefault();

        productCards.forEach((card) => {
            card.style.display = "";
        });

        if (productSearch) {
            productSearch.value = "";
        }

        document.querySelector(".product-grid").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
}



/* Delivery address form */
(function () {
    const deliveryButton = document.getElementById("delivery-location");
    const addressSection = document.getElementById("delivery-address-section");
    const closeButton = document.getElementById("close-delivery-form");
    const addressForm = document.getElementById("delivery-address-form");
    const locationText = document.getElementById("delivery-location-text");
    const message = document.getElementById("delivery-address-message");

    if (!deliveryButton || !addressSection || !closeButton || !addressForm) {
        return;
    }

    const fields = {
        state: document.getElementById("delivery-state"),
        city: document.getElementById("delivery-city"),
        area: document.getElementById("delivery-area"),
        street: document.getElementById("delivery-street"),
        phone: document.getElementById("delivery-phone")
    };

    function openAddressForm() {
        addressSection.hidden = false;
        message.textContent = "";
        fields.state.focus();
    }

    function closeAddressForm() {
        addressSection.hidden = true;
    }

    function loadSavedAddress() {
        try {
            const savedAddress = localStorage.getItem(
                "firstStandardDeliveryAddress"
            );

            if (!savedAddress) return;

            const address = JSON.parse(savedAddress);

            fields.state.value = address.state || "";
            fields.city.value = address.city || "";
            fields.area.value = address.area || "";
            fields.street.value = address.street || "";
            fields.phone.value = address.phone || "";

            if (locationText) {
                locationText.textContent = address.state
                    ? `${address.area}, ${address.city}, ${address.state}`
                    : "Nigeria";
            }
        } catch (error) {
            console.error("Could not load the saved delivery address.");
        }
    }

    deliveryButton.addEventListener("click", openAddressForm);
    closeButton.addEventListener("click", closeAddressForm);

    addressSection.addEventListener("click", function (event) {
        if (event.target === addressSection) {
            closeAddressForm();
        }
    });

    addressForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const address = {
            state: fields.state.value.trim(),
            city: fields.city.value.trim(),
            area: fields.area.value.trim(),
            street: fields.street.value.trim(),
            phone: fields.phone.value.trim()
        };

        if (Object.values(address).some(value => !value)) {
            message.textContent = "Please complete all address fields.";
            return;
        }

        try {
            localStorage.setItem(
                "firstStandardDeliveryAddress",
                JSON.stringify(address)
            );

            if (locationText) {
                locationText.textContent =
                    `${address.area}, ${address.city}, ${address.state}`;
            }

            message.textContent = "Delivery address saved successfully.";
            setTimeout(closeAddressForm, 1200);
        } catch (error) {
            message.textContent =
                "Unable to save the address. Please try again.";
        }
    });

    loadSavedAddress();
})();


// Load products from Supabase without replacing the existing storefront products.
(async function loadSupabaseProducts() {
    const productGrid = document.querySelector(".product-grid");

    if (!productGrid || !window.supabase || typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
        console.error("Supabase setup or product grid is missing.");
        return;
    }

    const client = window.storeSupabaseClient ||
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

window.storeSupabaseClient = client;
    const { data, error } = await client
        .from("products")
        .select("id, name, category, price, image_url, description, stock_quantity, available_colours")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load Supabase products:", error.message);
        return;
    }

    (data || []).forEach((product) => {
        const card = document.createElement("article");
        card.className = "product-card";
        card.dataset.supabaseProduct = "true";
        card.dataset.productId = String(product.id);

        const imageWrap = document.createElement("div");
        imageWrap.className = "product-image";
        const image = document.createElement("img");
        image.src = product.image_url;
        image.alt = product.name;
        image.loading = "lazy";
        imageWrap.appendChild(image);

        const info = document.createElement("div");
        info.className = "product-info";

        const category = document.createElement("p");
        category.className = "product-category";
        category.textContent = product.category;

        const name = document.createElement("h3");
        name.textContent = product.name;

        const description = document.createElement("p");
        description.className = "product-description";
        description.textContent = product.description || "";

        const price = document.createElement("p");
        price.className = "product-price";
        price.textContent = "₦" + Number(product.price).toLocaleString("en-NG");
        const colourSelect = document.createElement("select");
colourSelect.className = "product-colour-select";
colourSelect.dataset.productColour = "true";

const colours = Array.isArray(product.available_colours)
    ? product.available_colours
    : [];

if (colours.length > 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a colour";
    colourSelect.appendChild(placeholder);

    colours.forEach((colour) => {
        const option = document.createElement("option");
        option.value = colour;
        option.textContent =
            colour.charAt(0).toUpperCase() + colour.slice(1);
        colourSelect.appendChild(option);
    });
} else {
    colourSelect.style.display = "none";
}
        const stockStatus = document.createElement("p");
stockStatus.className = "product-stock";

const availableStock = Number(product.stock_quantity ?? 0);

if (availableStock > 0) {
    stockStatus.textContent = "In Stock: " + availableStock;
} else {
    stockStatus.textContent = "Out of Stock";
}

        const button = document.createElement("button");
        button.className = "add-to-cart";
        button.type = "button";
        button.textContent = "Add to Cart";

       info.append(
    category,
    name,
    description,
    price,
    colourSelect,
    stockStatus,
    button
);
        card.append(imageWrap, info);
        productGrid.appendChild(card);
    });

    productCards = document.querySelectorAll(".product-card");


productGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-cart");
    if (!button) return;

    const card = button.closest(".product-card[data-supabase-product]");
    if (!card) return;

    const name = card.querySelector("h3").textContent;
    const priceText = card.querySelector(".product-price").textContent;
    const price = Number(priceText.replace(/[₦,\s]/g, ""));

    const stockText = card.querySelector(".product-stock").textContent;
    const availableStock = Number(
        stockText.replace("In Stock: ", "")
    );

    if (stockText === "Out of Stock" || availableStock <= 0) {
        alert("Sorry, this product is out of stock.");
        return;
    }

const colourSelect = card.querySelector(
    "[data-product-colour]"
);

const selectedColour = colourSelect
    ? colourSelect.value
    : "";

if (colourSelect && !selectedColour) {
    alert("Please select a colour before adding this product to your cart.");
    colourSelect.focus();
    return;
}

const productId = Number(card.dataset.productId);

if (!Number.isInteger(productId) || productId <= 0) {
    alert("We could not identify this product. Please refresh and try again.");
    return;
}

const existingItem = cart.find(
    (item) =>
        Number(item.product_id) === productId &&
        (item.selected_colour || "") === selectedColour
);

if (existingItem && existingItem.quantity >= availableStock) {
    alert("Sorry, only " + availableStock + " unit(s) are available.");
    return;
}

if (existingItem) {
    existingItem.quantity += 1;
} else {
    cart.push({
        product_id: productId,
        name: name,
        price: price,
        quantity: 1,
        selected_colour: selectedColour
    });
}

        updateCartCount();
        saveCart();

        button.textContent = "Added ✓";
        setTimeout(() => {
            button.textContent = "Add to Cart";
        }, 1000);
    });

})().catch((error) => {
    console.error("Supabase product loading failed:", error);
});


async function loadSupabaseCategories() {
    const categoryContainer = document.getElementById("dynamic-category-links");
    const cardsContainer = document.getElementById("dynamic-category-cards");

    if (!categoryContainer || !cardsContainer || !window.storeSupabaseClient) {
        console.error("Category containers or Supabase client are missing.");
        return;
    }

    const { data, error } = await window.storeSupabaseClient
        .from("categories")
        .select("name")
        .order("name", { ascending: true });

    if (error) {
        console.error("Could not load categories:", error.message);
        return;
    }

    categoryContainer.innerHTML = "";
    cardsContainer.innerHTML = "";

    const categoryIcons = {
        "electronics": "📱",
        "fashion": "👗",
        "books": "📚",
        "home & kitchen": "🏠",
        "accessories": "👜",
        "beauty": "💄",
        "gaming": "🎮",
        "sports": "⚽",
        "toys": "🧸",
        "groceries": "🛒"
    };

    (data || []).forEach((category) => {
        const categoryName = category.name.trim();
        const normalizedName = categoryName.toLowerCase();

        // Create navigation link
        const link = document.createElement("a");
        link.href = "#products";
        link.dataset.category = categoryName;
        link.textContent = categoryName;
        categoryContainer.appendChild(link);

        // Create category card
        const card = document.createElement("a");
        card.href = "#products";
        card.className = "category-card";
        card.dataset.category = categoryName;

        const icon = document.createElement("span");
        icon.className = "category-icon";
        icon.textContent = categoryIcons[normalizedName] || "🛍️";

        const heading = document.createElement("h3");
        heading.textContent = categoryName;

        const description = document.createElement("p");
        description.textContent = "Explore " + categoryName + " products.";

        card.append(icon, heading, description);
        cardsContainer.appendChild(card);

        // Clicking a category card filters the products too
        card.addEventListener("click", (event) => {
            event.preventDefault();

            const selectedCategory = categoryName.toLowerCase();

            productCards.forEach((productCard) => {
                const productCategory = productCard.querySelector(".product-category");

                productCard.style.display =
                    productCategory &&
                    productCategory.textContent.trim().toLowerCase() === selectedCategory
                        ? ""
                        : "none";
            });

            if (productSearch) {
                productSearch.value = "";
            }

            document.querySelector(".product-grid").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    });
}


// Keep the Special Offers message synchronized with store settings.

async function loadSpecialOfferMessage() {
    const offerMessage = document.getElementById("special-offer-message");
    const heroCircle = document.querySelector(".hero-offer-circle");
    const heroPercent = document.getElementById("hero-discount-percent");
    const heroMinimum = document.getElementById("hero-discount-minimum");

    if (!window.storeSupabaseClient) return;

    try {
        const { data, error } = await window.storeSupabaseClient
            .from("store_settings")
            .select("setting_key, setting_value")
            .in("setting_key", [
                "bulk_discount_enabled",
                "bulk_discount_percent",
                "bulk_discount_min_quantity"
            ]);

        if (error) throw error;

        const settings = {};

        (data || []).forEach((setting) => {
            settings[setting.setting_key] = setting.setting_value;
        });

        const enabled = settings.bulk_discount_enabled === true;
        const percent = Number(settings.bulk_discount_percent ?? 5);
        const minimum = Number(settings.bulk_discount_min_quantity ?? 5);

        const validDiscount =
            enabled &&
            Number.isFinite(percent) &&
            percent > 0 &&
            percent <= 100 &&
            Number.isInteger(minimum) &&
            minimum >= 1;

        const { data: offers, error: offersError } =
            await window.storeSupabaseClient
                .from("discount_offers")
                .select("offer_name, discount_per_item, minimum_quantity")
                .eq("is_active", true);

        if (offersError) throw offersError;

        const validOffers = (offers || []).filter((offer) =>
            Number(offer.discount_per_item) > 0 &&
            Number.isFinite(Number(offer.discount_per_item)) &&
            Number.isInteger(Number(offer.minimum_quantity)) &&
            Number(offer.minimum_quantity) >= 1
        );

        const messages = [];

        if (validDiscount) {
            messages.push(
                "Buy " + minimum +
                " or more of the same product and enjoy " +
                percent + "% off."
            );
        }

        validOffers.forEach((offer) => {
            messages.push(
                (offer.offer_name || "Special offer") +
                ": Buy " + offer.minimum_quantity +
                " or more of an eligible product and save ₦" +
                Number(offer.discount_per_item).toLocaleString("en-NG") +
                " per item."
            );
        });

        if (offerMessage) {
            offerMessage.textContent = messages.length
                ? messages.join(" ")
                : "Check our store for current special offers.";
        }

        if (validDiscount) {
            if (heroPercent) {
                heroPercent.textContent = percent + "% OFF";
            }

            if (heroMinimum) {
                heroMinimum.textContent = minimum + "+";
            }

            if (heroCircle) {
                heroCircle.style.display = "";
            }
        } else if (heroCircle) {
            heroCircle.style.display = "none";
        }

    } catch (error) {
        console.error("Could not load the Special Offers message:", error);

        if (offerMessage) {
            offerMessage.textContent =
                "Check our store for current special offers.";
        }

        if (heroCircle) {
            heroCircle.style.display = "none";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const waitForSupabase = setInterval(() => {
        if (window.storeSupabaseClient) {
            clearInterval(waitForSupabase);
            loadSupabaseCategories();
            loadSpecialOfferMessage();
        }
    }, 200);
});