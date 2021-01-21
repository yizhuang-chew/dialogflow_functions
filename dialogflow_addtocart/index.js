const _sdkClient = require('@commercetools/sdk-client')
const _sdkMiddlewareAuth = require('@commercetools/sdk-middleware-auth')
const _sdkMiddleWareHttp = require('@commercetools/sdk-middleware-http')
const _apiRequestBuilder = require('@commercetools/api-request-builder')
const fetch = require('node-fetch');

const projectKey = process.env.projectKey;
const clientSecret = process.env.clientSecret;
const clientId = process.env.clientId;
const apiUrl = process.env.apiUrl;
const authUrl = process.env.authUrl;

/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 *                     More info: https://expressjs.com/en/api.html#req
 * @param {Object} res Cloud Function response context.
 *                     More info: https://expressjs.com/en/api.html#res
 */

function createClient() {
    const client = _sdkClient.createClient({
        middlewares: [
            _sdkMiddlewareAuth.createAuthMiddlewareForClientCredentialsFlow({
                host: authUrl,
                projectKey: projectKey,
                credentials: {
                    clientId: clientId,
                    clientSecret: clientSecret
                },
                fetch
            }),
            _sdkMiddleWareHttp.createHttpMiddleware({ host: apiUrl, fetch })
        ]
    });
    return client;
}

function createCartRequest(purchaseItem, cartId, cartVersion) {
    
    const requestBuilder = _apiRequestBuilder.createRequestBuilder({ projectKey: projectKey })
    const cartsService = requestBuilder.carts;
    let cartPostRequest;
    
    // If cart does not exist, create cart
    if (typeof cartId === 'undefined') {
        cartPostRequest = {
            uri: cartsService
                .build(),
            method: 'POST',
            body: {
                currency: "AUD", // Can be updated to be dynamic in future
                lineItems: [
                    {
                        sku: purchaseItem,
                        quantity: 1,
                    }
                ],
            },
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };
    }
    // Existing Cart
    else {
        const cartsUpdateService = requestBuilder.carts.byId(cartId);
        cartPostRequest = {
            uri: cartsUpdateService
                .build(),
            method: 'POST',
            body: {
                version: cartVersion,
                actions: [
                    {
                        action : "addLineItem",
                        sku: purchaseItem,
                        quantity: 1,
                    }
                ],
            },
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };
    }
    return cartPostRequest;
}

function createWebhookResponse(cartId, cartVersion, cartTotalPrice, purchaseItem, purchaseItemPrice){
    
    let responseMessage = {};
    responseMessage.fulfillment_response = {};
    responseMessage.fulfillment_response.messages = [];
    responseMessage.session_info = {};
    responseMessage.session_info.parameters = {};

    responseMessage.session_info.parameters.cartId = cartId;
    responseMessage.session_info.parameters.cartVersion = cartVersion;
    responseMessage.session_info.parameters.confirmed_item = purchaseItem;
    
    cartTotalPriceAmount = cartTotalPrice.centAmount / (10 ** cartTotalPrice.fractionDigits);
    cartTotalPriceText = cartTotalPrice.currencyCode + " " + cartTotalPriceAmount.toString();
    responseMessage.session_info.parameters.cartTotalPrice = cartTotalPriceText;

    purchaseItemPriceAmount = purchaseItemPrice.centAmount / (10 ** purchaseItemPrice.fractionDigits);
    purchaseItemPriceText = purchaseItemPrice.currencyCode + " " + purchaseItemPriceAmount.toString();
    responseMessage.session_info.parameters.purchaseItemPrice = purchaseItemPriceText;

    return responseMessage;
}

exports.addToCart = (req, res) => {

    // Parameters from Webhook Request
    const parameters = req.body.sessionInfo.parameters;
    const purchaseItem = parameters.purchase_item;
    const cartId = parameters.cartId;
    const cartVersion = parameters.cartVersion;

    // Build commercetools API Request
    const cartPostRequest = createCartRequest(purchaseItem, cartId, cartVersion);

    // Execute the commercetools Request
    const client = createClient();
    client
        .execute(cartPostRequest)
        .then(response => {

            // Build Webhook Response
            let cartId = response.body.id;
            let cartVersion = response.body.version;
            let cartTotalPrice = response.body.totalPrice;
            let cartLineItems = response.body.lineItems;
            let purchaseLineItem = cartLineItems.find(lineItem => lineItem['variant']['sku'] === purchaseItem);
            let purchaseItemPrice = purchaseLineItem['price']['value'];

            let responseMessage = createWebhookResponse(cartId, cartVersion, cartTotalPrice, purchaseItem, purchaseItemPrice)
            console.log(responseMessage);

            res.status(200).send(responseMessage);
        });
};