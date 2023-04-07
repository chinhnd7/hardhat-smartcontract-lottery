# Event in Solidity

1. Events cho phép in log 1 cách tiết kiệm, hơn so với storage variable
2. Events and logs live in this special data structure that isn't accessible to smart contracts.
3. Có thể có tới 3 indexed parameters = topics

# VRFConsumerBaseV2

1. Phải đăng ký Subscription ID với vrf.chain.link. Subscription ID sẽ được sử dụng trong contract khi request random value

# Chainlink Keepers

1. Giúp contract `auto` thực hiện 1 hoạt động nào đó.
2. checkUpkeep() và performUpkeep(): 2 phương thức giúp thực hiện việc này, khi checkUpkeep() trả về

```js
(bool upkeepNeeded, ) = checkUpkeep("");
```

performUpkeep() sẽ quyết định thực hiện hoặc là không?

## Unit Test

`describe block` can't work with promises.
=> khai báo async trong

```js
describe("describe something", async function () => {
    // do something
})
```

=> không có tác dụng

## Staging Test

Staging tests only run on testnet
Unit tests only run on development chains
