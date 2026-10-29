

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


const shopWhatsApp = "2347065862871";

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




async function sendOrderToWhatsApp() {
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
        quantity: Number(item.quantity)
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

    const orderTotal = orderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    const functionURL =
        SUPABASE_URL.replace(/\/$/, "") +
        "/functions/v1/smart-action";

    let response;
    let savedOrder;

    try {
        response = await fetch(functionURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": "Bearer " + SUPABASE_PUBLISHABLE_KEY
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



    alert("Order " + savedOrder.order_number + " saved successfully.");

    let message =
        "Hello FIRST STANDARD MULTI STORES! I would like to place an order:\n\n";

    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        message += `${index + 1}. ${item.name}\n`;
        message += `Quantity: ${item.quantity}\n`;
        message += `Price: ₦${item.price.toLocaleString("en-NG")}\n`;
        message += `Subtotal: ₦${itemTotal.toLocaleString("en-NG")}\n\n`;
    });

    message += `Total: ₦${total.toLocaleString("en-NG")}\n\n`;

    message += "DELIVERY ADDRESS\n";
    message += `State/FCT: ${deliveryAddress.state}\n`;
    message += `City/Town: ${deliveryAddress.city}\n`;
    message += `Area: ${deliveryAddress.area}\n`;
    message += `Street: ${deliveryAddress.street}\n`;
    message += `Phone: ${deliveryAddress.phone}\n\n`;

    message +=
        "Please confirm delivery availability, charges, and order details. Thank you.";

    const whatsappURL =
        "https://wa.me/" +
        shopWhatsApp +
        "?text=" +
        encodeURIComponent(message);

    window.open(whatsappURL, "_blank");
}



if (cartLink) {
    cartLink.addEventListener("click", (event) => {
        event.preventDefault();
        sendOrderToWhatsApp();
    });
}


const cartPanel = document.querySelector("#cart-panel");
const cartItemsContainer = document.querySelector("#cart-items");
const cartTotalElement = document.querySelector("#cart-total");
const closeCartButton = document.querySelector("#close-cart");
const checkoutButton = document.querySelector("#checkout-whatsapp");

function renderCartPanel() {
    if (!cartItemsContainer || !cartTotalElement) return;

    cartItemsContainer.innerHTML = "";
    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const row = document.createElement("div");
        row.className = "cart-item";

        row.innerHTML = `
            <div>
                <strong>${item.name}</strong>
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

    cartTotalElement.textContent = "₦" + total.toLocaleString("en-NG");
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

if (checkoutButton) {
    checkoutButton.addEventListener("click", sendOrderToWhatsApp);
}


updateCartCount();
renderCartPanel();



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


const categoryLinks = document.querySelectorAll(
    ".category-nav a[data-category]"
);

categoryLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();

        const selectedCategory = link.dataset.category.toLowerCase();

        productCards.forEach((card) => {
            const category = card
                .querySelector(".product-category")
                .textContent.trim()
                .toLowerCase();

            const matchesCategory = category === selectedCategory;

            card.style.display = matchesCategory ? "" : "none";
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
        .select("id, name, category, price, image_url, description, stock_quantity")
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

       info.append(category, name, description, price, stockStatus, button);
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

   
const productId = Number(card.dataset.productId);

if (!Number.isInteger(productId) || productId <= 0) {
    alert("We could not identify this product. Please refresh and try again.");
    return;
}

const existingItem = cart.find(
    (item) => Number(item.product_id) === productId
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

})().catch((error) => {
    console.error("Supabase product loading failed:", error);
});