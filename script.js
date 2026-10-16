

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


function sendOrderToWhatsApp() {
    if (cart.length === 0) {
        alert("Your cart is empty. Please add a product first.");
        return;
    }

    let message = "Hello FIRST STANDARD MULTI STORES! I would like to place an order:\n\n";

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
    message += "Please confirm availability and delivery details. Thank you.";

    const whatsappURL =
        "https://wa.me/" + shopWhatsApp + "?text=" + encodeURIComponent(message);

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
const productCards = document.querySelectorAll(".product-card");

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