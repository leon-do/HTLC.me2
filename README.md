node app.js


```
// main.js
App.createInvoice = (args, cbk) => {
  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify({tokens: args.tokens}),
    type: 'POST',
    url: `https://htlc.me/v0/invoices/${App.wallet_id}/`,
  })
  .done(res => {
    if (!res || !res.id || !res.request) {
      return cbk([503, 'Expected id, request', res]);
    }

    return cbk(null, {
      fiat_value: res.fiat_value,
      id: res.id,
      request: res.request,
    });
  })
  .fail((r) => cbk([r.status, r.statusText]))

  return;
};

// aka relying on a 3rd party to create your invoice aka bad
```