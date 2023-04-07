const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../../helper-hardhat-config")

console.log(network.name)

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
        const chainId = network.config.chainId

        beforeEach(async function () {
            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])
            raffle = await ethers.getContract("Raffle", deployer)
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            raffleEntranceFee = await raffle.getEntranceFee()
            interval = await raffle.getInterval()
        })

        describe("constructor", function () {
            it("Initializes the raffle correctly", async function () {
                // Ideally we make our tests have just 1 assert per "it"
                const raffleState = await raffle.getRaffleState()

                assert.equal(raffleState.toString(), "0")
                assert.equal(interval.toString(), networkConfig[chainId]["interval"])
            })
        })

        describe("enterRaffle", function () {
            it("reverts when you don't pay enough", async function () {
                await expect(raffle.enterRaffle()).to.be.revertedWith(
                    "Raffle__NotEnoughETHEntered"
                )
            })

            it("records players when they enter", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                const playerFromContract = await raffle.getPlayer(0)
                assert.equal(playerFromContract, deployer)
            })

            it("emits event on enter", async function () {
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                    raffle,
                    "RaffleEnter"
                )
            })

            it("doesnt allow entrance when raffle is calculating", async function () {
                // checkUpkeep returns true when timePassed > interval + ...
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                // Đã mock xong checkUpkeep

                // we pretend to be a Chainlink Keeper
                await raffle.performUpkeep([])

                // Lúc này hệ thống đang tính toán
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                    "Raffle__NotOpen"
                )
            })
        })

        describe("checkUpkeep", function () {
            it("returns false if people haven't sent any ETH", async function () {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                // function checkUpkeep là public function, nên nó sẽ send transaction khi được gọi
                // chúng ta sẽ sử dụng callStactic, simulate sending transaction 
                // và chỉ kiểm tra giá trị trả về
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })

            it("returns false if raffle isn't open", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep([])
                const raffleState = await raffle.getRaffleState()
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                assert.equal(raffleState.toString(), "1")
                assert.equal(upkeepNeeded, false)
            })

            it("returns false if enough time hasn't passed", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 2])
                await network.provider.request({ method: "evm_mine", params: [] })
                // this parameter "0x" is a blank byte object
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                assert.equal(upkeepNeeded, false)
            })

            it("returns true if enough time has passed, has player, eth, and is open", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                // this parameter "0x" is a blank byte object
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                assert.equal(upkeepNeeded, true)
            })
        })

        describe("performUpkeep", function () {
            it("it can only run if checkUpkeep is true", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])

                const tx = await raffle.performUpkeep([])
                assert(tx)
            })

            it("reverts when checkUpkeep is false", async function () {
                await expect(raffle.performUpkeep([])).to.be.revertedWith(
                    "Raffle__UpkeepNotNeeded"
                )
            })

            it("updates the raffle state, emits and event, and calls the vrf coordinator", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const txResponse = await raffle.performUpkeep([])
                const txReceipt = await txResponse.wait(1)

                // Trong file VRFCoordinatorV2Mock.sol
                // performUpkeep có emit 1 event trong performUpkeep
                // vì vậy event RequestedRaffleWinner của chúng ta sẽ có index là 1
                // (event trong file mock có index là 0)
                const requestId = txReceipt.events[1].args.requestId
                const raffleState = await raffle.getRaffleState()
                assert(requestId.toNumber() > 0)
                assert(raffleState == 1)
            })
        })

        describe("fulfillRandomWords", function () {
            beforeEach(async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })

            it("can only be called after performUpkeep", async function () {
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                ).to.be.revertedWith("nonexistent request")
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                ).to.be.revertedWith("nonexistent request")
            })
            // Wayyyyy to big
            it("picks a winner, resets the lottery, and sends money", async function () {
                const additionalEntrants = 3
                const startingAccountIndex = 1 // deployer = 0
                const accounts = await ethers.getSigners()
                for (
                    let i = startingAccountIndex;
                    i < startingAccountIndex + additionalEntrants;
                    i++
                ) {
                    const accountConnectedRaffle = raffle.connect(accounts[i])
                    await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                }
                const startingTimeStamp = await raffle.getLatestTimeStamp()

                // performUpkeep (mock being chainlink keepers)
                // fulfillRandomWords (mock being the Chainlink VRF)
                // we will have to wait for the fulfillRandomWords to be called
                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("Found the event!")
                        try {
                            const recentWinner = await raffle.getRecentWinner()
                            console.log(recentWinner)
                            console.log(accounts[2].address)
                            console.log(accounts[0].address)
                            console.log(accounts[1].address)
                            console.log(accounts[3].address)

                            const raffleState = await raffle.getRaffleState()
                            const endingTimeStamp = await raffle.getLatestTimeStamp()
                            const numPlayers = await raffle.getNumberOfPlayers()
                            const winnerEndingBalance = await accounts[1].getBalance()
                            assert.equal(numPlayers.toString(), "0")
                            assert.equal(raffleState.toString(), "0")
                            assert(endingTimeStamp > startingTimeStamp)

                            assert.equal(winnerEndingBalance.toString(),
                                winnerStartingbalance.add(
                                    raffleEntranceFee
                                        .mul(additionalEntrants)
                                        .add(raffleEntranceFee)
                                        .toString()
                                ))
                        } catch (e) {
                            reject(e)
                        }
                        resolve()
                    })
                    // Setting up the listener
                    // below, we will fire the event, and the listener will pick it up, and resolve
                    const tx = await raffle.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnerStartingbalance = await accounts[1].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        raffle.address
                    )
                })

            })
        })
    })