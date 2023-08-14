const express = require('express');
const app = express();
const {resolve} = require('path');
const {default: Stripe} = require('stripe');
const env = require('dotenv').config({path: './.env'});
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
app.use(express.static(process.env.STATIC_DIR));
app.use(
  express.json({
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith('/webhook')) {
        req.rawBody = buf.toString();
      }
    },
  })
);

var payment_intent_id;
app.get('/', (req, res) => {
  const path = resolve(process.env.STATIC_DIR + '/index.html');
  res.sendFile(path);
});
app.get('/config', (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});
app.get('/create-payment-intent', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      currency: 'USD',
      amount: 100,
      automatic_payment_methods: {enabled: false},
    });
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
    payment_intent_id = paymentIntent.id;

    console.log('paymentIntent ID: ', paymentIntent.id);
  } catch (e) {
    return res.status(400).send({
      error: {
        message: e.message,
      },
    });
  }
});

app.get('/api', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment_intent_id
    );
    const amount = paymentIntent.amount_received;
    const currency = paymentIntent.currency;
    const status = paymentIntent.status;
    const card_types = paymentIntent.payment_method_types;

    res.status(200).json({
      amount,
      currency,
      status,
      card_types,
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({message: 'An error occurred'});
  }
});

app.post('/webhook', async (req, res) => {
  let data, eventType;
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    let event;
    let signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === 'payment_intent.succeeded') {
    console.log('💰 Payment captured!');
  } else if (eventType === 'payment_intent.payment_failed') {
    console.log('❌ Payment failed.');
  }
  console.log(data);
  res.sendStatus(200);
});

app.listen(process.env.PORT, () =>
  console.log(`Node server listening at `, process.env.PORT)
);
