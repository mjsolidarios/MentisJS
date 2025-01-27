var Ment = Ment || {};
{
	class Net {
		constructor(layers, optimizer) {
			this.layers = layers || [];
			this.batchSize = 19;
			this.epoch = 0;
			this.lr = 0.01;
			this.optimizer = optimizer || 'SGD';

			this.connectLayers();
		} //END OF CONSTRUCTOR

		set learningRate(lr) {
			for (var i = 0; i < this.layers.length; i++) {
				this.layers[i].lr = lr;
			}
			this.lr = lr;
		}

		get learningRate() {
			return this.lr;
		}

		get inData() {
			return this.layers[0].inData;
		}

		set inData(arr) {
			if (arr.length == this.layers[0].inSize()) {
				this.layers[0].inData = arr;
			} else {
				throw 'cant set in data because its the wrong size';
			}
		}

		connectLayers() {
			//by 'connect' we mean set the outData to the inData of adjacent layers.
			//this is so we dont have to copy over the arrays
			//Also we set the 'nextLayer' and 'previousLayer' attributes to each layer accordingly
			for (var i = 0; i < this.layers.length; i++) {
				if (i < this.layers.length - 1) {
					this.layers[i + 1].previousLayer = this.layers[i];
					this.layers[i].nextLayer = this.layers[i + 1];

					if (this.layers[i].outSize() != this.layers[i + 1].inSize()) {
						throw `Failure connecting ${this.layers[i].constructor.name} layer with ${this.layers[i + 1].constructor.name},${
							this.layers[i].constructor.name
						} output size: ${this.layers[i].outSize()}${this.layers[i].outSizeDimensions ? ' (' + this.layers[i].outSizeDimensions() + ')' : ''}, ${
							this.layers[i + 1].constructor.name
						} input size: ${this.layers[i + 1].inSize()}${this.layers[i + 1].outSizeDimensions ? ' (' + this.layers[i + 1].outSizeDimensions() + ')' : ''}`;
					}
					this.layers[i + 1].inData = this.layers[i].outData;
				}
			}
			for (var i = 0; i < this.layers.length; i++) {
				if (this.layers[i].onConnect) {
					this.layers[i].onConnect(); //this is useful for layers like ResEmitter that need to init after being connected
				}
			}
		}

		forward(data) {
			if (!Array.isArray(data)) {
				if (typeof data == 'number') {
					data = [data];
				} else {
					throw 'INPUT ARRAYS INTO FORWARDS FUNCTION ONLY!';
				}
			}
			this.layers[0].forward(data);
			for (var i = 1; i < this.layers.length; i++) {
				this.layers[i].forward();
			}
			return new Float32Array(this.layers[this.layers.length - 1].outData); //return inData of the last layer (copied btw so you can change it if you want)
		}

		enableGPU() {
			for (var i = 0; i < this.layers.length; i++) {
				this.layers[i].gpuEnabled = true;
				if (this.layers[i].initGPU) {
					this.layers[i].initGPU();
				}
			}
		}

		mutate(rate, intensity) {
			for (var i = 0; i < this.layers.length; i++) {
				if (this.layers[i].mutate) {
					this.layers[i].mutate(rate, intensity);
				}
			}
		}

		disableGPU() {
			for (var i = 0; i < this.layers.length; i++) {
				this.layers[i].gpuEnabled = false;
			}
		}

		save(saveToFile, filename) {
			//this can be made better.
			//this method returns a string of json used to get the model back

			if (saveToFile) {
				if (Ment.isBrowser()) {
					var a = document.createElement('a');
					var file = new Blob([this.save()]);
					a.href = URL.createObjectURL(file);
					a.download = 'model.json';
					a.click();
				} else {
					var fs = require('fs');
					fs.writeFileSync(filename, this.save());
				}
			}

			let saveObject = {};

			saveObject.layerAmount = this.layers.length;
			saveObject.optimizer = this.optimizer;
			saveObject.lr = this.lr;
			saveObject.batchSize = this.batchSize;
			for (var i = 0; i < this.layers.length; i++) {
				let layer = this.layers[i];
				let layerSaveObject = {};
				layerSaveObject.type = layer.constructor.name;
				saveObject['layer' + i] = layerSaveObject;
				if (!layer.save) {
					throw `Layer ${i} (${layer.constructor.name}) in your network doesnt have a save() function so your model cant be saved`;
				}
				layerSaveObject.layerData = layer.save();
			}

			return JSON.stringify(saveObject);
		} //end of save method

		static load(json) {
			let jsonObj = JSON.parse(json);
			let layers = [];
			for (var i = 0; i < jsonObj.layerAmount; i++) {
				let layer = Ment[jsonObj['layer' + i].type].load(jsonObj['layer' + i].layerData);
				layers.push(layer);
			}
			let ret = new Ment.Net(layers, jsonObj.optimizer);
			ret.learningRate = jsonObj.lr;
			ret.batchSize = jsonObj.batchSize;
			return ret;
		} //end of load method

		copy(net) {
			/* This method copies the weights and bes of one network into its own weights and bes  */
		} //end of copy method

		train(input, expectedOut) {
			this.forward(input);

			let loss = this.backward(expectedOut);
			//done backpropping
			this.epoch++;
			if (this.epoch % this.batchSize == 0) {
				for (var i = this.layers.length - 1; i >= 0; i--) {
					if (this.layers[i].updateParams) this.layers[i].updateParams(this.optimizer);
				}
			}
			//done updating params if epoch % batchsize is zero
			return loss;
		}

		backward(expected) {
			let loss = this.layers[this.layers.length - 1].backward(expected);
			for (var i = this.layers.length - 2; i >= 0; i--) {
				this.layers[i].backward();
			}
			return loss;
		}
	} //END OF NET CLASS DECLARATION

	Ment.Net = Net;
}
var Ment = Ment || {};
{
	class Population {
		constructor(netLayers, popSize, elitism, mutationRate, mutationIntensity) {
			this.networks = [];
			this.popSize = popSize;
			this.highScore = 0;
			this.mutationRate = mutationRate || 0.3;
			this.mutationIntensity = mutationIntensity || 0.6;
			this.elitism = elitism;
			let baseNet = new Ment.Net(netLayers);
			baseNet.score = 0;
			for (let i = 0; i < popSize - 1; i++) {
				let net = Ment.Net.load(baseNet.save());
				net.score = 0;
				this.networks.push(net);
			}
			this.networks.push(baseNet);
		}

		cullAndBreed() {
			//keeps the strongest players.
			//brutally kills the weakest

			//but first we have to sort them. good to bad
			this.networks.sort((a, b) => (a.score > b.score ? -1 : 1));
			this.highScore = this.networks[0].score < this.highScore ? this.highScore : this.networks[0].score;
			//next we put the best ones in an array for later
			let newPopulation = [];
			for (let i = 0; i < this.elitism; i++) {
				this.networks[i].score = 0;
				newPopulation.push(this.networks[i]);
				//this actually only pushes the references btw.
				//which is fine
			}
			//next we have to generate enough offspring to fill the rest of the pop
			//higher scores have a higher chance of making offspring
			//"making offspring" just means a mutated net is made from it.
			for (let i = 0; i < this.popSize - this.elitism; i++) {
				for (let j = 0; j < this.popSize; j++) {
					if (Math.random() < 0.3) {
						//doing this with a sorted population should randomly choose
						//the best ones to breed
						let t = Ment.Net.load(this.networks[i].save());
						t.score = 0; //init score
						t.mutate(0.6, this.mutationRate);
						newPopulation.push(t);
						j = this.popSize + 5; //this is just to end the for loop
					}
					if (j == this.popSize - 1) {
						j = 0; //incase you just get super unlucky we have a fail safe.
					}
				}
			}

			// for (var i = 0; i < newPopulation.length; i++) {
			// 	newPopulation[i].score = 0;
			// }
			this.networks = newPopulation;
		}
	}

	Ment.Population = Population;
}
var Ment = Ment || {};
{
	var return_v = false;
	var v_val = 0.0;
	var gaussRandom = function () {
		if (return_v) {
			return_v = false;
			return v_val;
		}
		var u = 2 * Math.random() - 1;
		var v = 2 * Math.random() - 1;
		var r = u * u + v * v;
		if (r == 0 || r > 1) return gaussRandom();
		var c = Math.sqrt((-2 * Math.log(r)) / r);
		v_val = v * c; // cache this
		return_v = true;
		return u * c;
	};
	var isBrowser = () => !(typeof window === 'undefined');
	//wrap everything in a namespace to not pollute global

	let clamp = function (num, min, max) {
		min = min | 0;
		max = max | 1;
		return Math.max(Math.min(num, max), min);
	};

	let lin = function (num) {
		return num;
	};

	let bounce = function (num, minmax) {
		minmax = minmax | 3;
		if (Math.abs(num) > minmax) {
			var t = (minmax * num) / Math.abs(num);
			num = t - (num - t);
			return bounce(num, minmax);
		}
		return num;
	};

	let getLoss = function (results, expected) {
		var loss = 0;
		for (var i = 0; i < results.length; i++) {
			loss += Math.pow(results[i] - expected[i], 2);
		}
		loss = loss / results.length;
		return loss;
	};

	let polluteGlobal = function () {
		for (const [key, value] of Object.entries(Ment)) {
			if (isBrowser()) {
				window[key] = value;
			} else {
				global[key] = value; //node
			}
		}
	};

	let render = function (net, ctx, x, y, scale, background, spread) {
		// a built in network renderer
		if (background == undefined) {
			background = true;
		}
		const SPREAD = spread || 10;
		const DRAWBACKGROUND = background;
		let maxSize = 1;
		for (var i = 0; i < net.layers.length; i++) {
			if (net.layers[i].constructor.name != 'ConvLayer' && net.layers[i].constructor.name != 'MaxPoolLayer') {
				if (net.layers[i].inSize() > maxSize) {
					maxSize = net.layers[i].inSize();
				} //end of if
				if (net.layers[i].outSize() > maxSize) {
					maxSize = net.layers[i].outSize();
				} //end of if
			} //end of for
			if (DRAWBACKGROUND) {
				ctx.fillStyle = 'grey';
				ctx.fillRect(x, y, 5 + net.layers.length * scale * SPREAD + scale, 5 + maxSize * scale * 2);
			}
		}

		//render the neurons in each layer...
		for (i = 0; i < net.layers.length; i++) {
			let layer = net.layers[i];
			if (layer.constructor.name != 'ConvLayer' && layer.constructor.name != 'MaxPoolLayer') {
				for (var h = 0; h < layer.outSize(); h++) {
					ctx.fillStyle = 'rgb(' + layer.outData[j] * 255 + ',' + layer.outData[j] * 255 + ',' + layer.outData[j] * 255 + ')';
					ctx.fillRect(x + 5 + (i + 1) * scale * SPREAD, y + 5 + h * scale * 2 + ((maxSize * scale * 2) / 2 - (layer.outSize() * scale * 2) / 2), scale, scale);
				}

				for (var j = 0; j < layer.inSize(); j++) {
					ctx.fillStyle = 'rgb(' + layer.inData[j] * 255 + ',' + layer.inData[j] * 255 + ',' + layer.inData[j] * 255 + ')';
					ctx.fillRect(x + 5 + i * scale * SPREAD, y + 5 + j * scale * 2 + ((maxSize * scale * 2) / 2 - (layer.inSize() * scale * 2) / 2), scale, scale);
				}
				//end of render neurons for each layer
			}
			if (layer.constructor.name == 'FCLayer') {
				//render weights in the fc layer

				for (var j = 0; j < layer.inSize(); j++) {
					for (var h = 0; h < layer.outSize(); h++) {
						ctx.strokeStyle = 'rgb(' + -(layer.w[j * layer.outSize() + h] * 255) + ',' + layer.w[j * layer.outSize() + h] * 255 + ',0)';
						ctx.beginPath();
						ctx.moveTo(
							x + 5 + i * scale * SPREAD + scale / 2,
							scale / 2 + y + 5 + j * scale * 2 + ((maxSize * scale * 2) / 2 - (layer.inSize() * scale * 2) / 2)
						);
						ctx.lineTo(
							x + 5 + (i + 1) * scale * SPREAD + scale / 2,
							scale / 2 + y + 5 + h * scale * 2 + ((maxSize * scale * 2) / 2 - (layer.outSize() * scale * 2) / 2)
						);
						ctx.stroke();
					} //end of foor loop each outSize
				} //end of for loop each inSize
			} //end of if layer is fc
			if (
				layer.constructor.name == 'SigmoidLayer' ||
				layer.constructor.name == 'SineLayer' ||
				layer.constructor.name == 'TanhLayer' ||
				layer.constructor.name == 'ReluLayer'
			) {
				//render the word sigmoid in between the nodes
				ctx.fillStyle = 'white';
				ctx.font = scale + 'px serif';
				ctx.fillText(
					layer.constructor.name.slice(0, -5),
					x + 5 + (i + 0.4) * scale * SPREAD,
					y + 5 + (layer.inSize() / 2) * scale * 2 + ((maxSize * scale * 2) / 2 - (layer.inSize() * scale * 2) / 2)
				);
			}

			if ((layer.constructor.name = 'ConvLayer')) {
			}
		} //end of for loop each layer
	};

	Ment.clamp = clamp;
	Ment.render = render;
	Ment.getLoss = getLoss;
	Ment.tanh = Math.tanh;
	Ment.lin = lin;
	Ment.bounce = bounce;
	Ment.isBrowser = isBrowser;
	Ment.gaussRandom = gaussRandom;
	Ment.polluteGlobal = polluteGlobal;
	let globalObject = isBrowser() ? window : global;
	if (globalObject.GPU) {
		const gpu = new GPU();
		Ment.gpu = gpu;
	}

	if (!Ment.isBrowser()) {
		//test if we are in node
		if (typeof module === 'undefined' || typeof module.exports === 'undefined') {
			window.Ment = Ment; // in ordinary browser attach library to window
		} else {
			module.exports = Ment; // in nodejs
		}
	}
}
//Base layer for all activations to inherit from

{
	class ActivationBase {
		constructor(size) {
			this.nextLayer; //the connected layer
			this.inData = new Float32Array(size);
			this.outData = new Float32Array(size);
			this.costs = new Float32Array(size); //costs for each neuron
			this.pl; //reference to previous layer
		}

		get previousLayer() {
			return this.pl;
		}
		set previousLayer(layer) {
			// try to connect to it
			if (this.inData.length == 0) {
				//if not already initialized
				this.inData = new Float32Array(layer.outSize());
				this.outData = new Float32Array(layer.outSize());
				this.costs = new Float32Array(layer.outSize());
			}
			this.pl = layer;
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		forward(inData, actFunction) {
			if (inData) {
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.outSize(); h++) {
				this.outData[h] = actFunction(this.inData[h]);
			}
			//Oh the misery
		}

		backward(expected, actFunctionPrime) {
			let loss = 0;
			if (!expected) {
				if (this.nextLayer == undefined) {
					throw 'nothing to backpropagate!';
				}
				expected = [];
				for (var i = 0; i < this.outData.length; i++) {
					expected.push(this.nextLayer.costs[i] + this.nextLayer.inData[i]);
				}
			}

			for (var j = 0; j < this.outSize(); j++) {
				let err = expected[j] - this.outData[j];
				loss += Math.pow(err, 2);
				this.costs[j] = err * actFunctionPrime(this.inData[j]);
			}
			return loss / this.outSize();
		}

		save() {
			this.savedSize = this.inSize();

			let ret = JSON.stringify(this, function (key, value) {
				//here we define what we need to save
				if (key == 'inData' || key == 'outData' || key == 'costs' || key == 'nextLayer' || key == 'previousLayer') {
					return undefined;
				}

				return value;
			});

			//This is how you delete object properties btw.
			delete this.savedInSize;

			return ret;
		}
	}

	Ment.ActivationBase = ActivationBase;
}
{
	/*
if filter is 3x3 with indepth of 3 the first filter stored as such:
this.filterw = [0,1,2,3,4,5,6,7,8,
								0,1,2,3,4,5,6,7,8,
								0,1,2,3,4,5,6,7,8]

Each filter has depth equal to the InDepth, thats why there are three 3x3 in the array.

this.filterw
[filterNum * this.inDepth * filterWidth * filterHeight + x + (y * filterWidth) + (depth * filterWidth * filterHeight)]

if you wanna input an image do it like this.
[r,r,r,r,g,g,g,g,b,b,b,b,b]
NOT like this:
[r,g,b,r,g,b,r,g,b,r,g,b]
*/

	class ConvLayer {
		constructor(inWidth, inHeight, inDepth, filterWidth, filterHeight, filters = 3, stride = 1, padding = 0) {
			if (padding != 0) {
				throw (
					'Dear user, I have not implemented padding yet.. set it to zero to avoid this message. ' +
					'Star the project if you want me to complete it. or send me 5 bucks ill do it right now.'
				);
			}
			this.lr = 0.01; //learning rate, this will be set by the Net object

			this.filters = filters; //the amount of filters
			this.inWidth = inWidth;
			this.inHeight = inHeight;
			this.inDepth = inDepth;
			this.filterWidth = filterWidth;
			this.filterHeight = filterHeight;
			this.stride = stride;
			this.padding = padding;
			this.filterw = new Float32Array(filters * inDepth * filterWidth * filterHeight);
			this.filterws = new Float32Array(filters * inDepth * filterWidth * filterHeight);
			this.trainIterations = 0;
			this.outData = new Float32Array(
				Math.ceil((inWidth - filterWidth + 2 * padding + 1) / stride) * Math.ceil((inHeight - filterHeight + 2 * padding + 1) / stride) * this.filters
			);
			this.inData = new Float32Array(inWidth * inHeight * inDepth);
			this.inData.fill(0); //to prevent mishap
			this.costs = new Float32Array(inWidth * inHeight * inDepth);
			// this.b = new Float32Array(this.outData.length);  bias in a conv layer is dumb
			// this.bs = new Float32Array(this.outData.length);
			// this.accessed = new Float32Array(this.inData.length).fill(1);
			if (this.filterWidth > inWidth + padding || this.filterHeight > inHeight + padding) {
				throw 'Conv layer error: filters cannot be bigger than the input';
			}
			//init random weights
			for (var i = 0; i < this.filterw.length; i++) {
				this.filterw[i] = 0.1 * Math.random() * (Math.random() > 0.5 ? -1 : 1);
			}
			// for (var i = 0; i < this.b.length; i++) {
			// 	this.b[i] = 1 * Math.random() * (Math.random() > 0.5 ? -1 : 1);
			// }

			//Everything below here is precalculated constants used in forward/backward
			//to optimize this and make sure we are as effeiciant as possible.
			//DONT CHANGE THESE OR BIG BREAKY BREAKY!

			this.hMFHPO = Math.ceil((this.inHeight - this.filterHeight + 1) / this.stride);
			this.wMFWPO = Math.ceil((this.inWidth - this.filterWidth + 1) / this.stride);
			this.hMFWMF = this.hMFHPO * this.wMFWPO;
			this.wIH = this.inWidth * this.inHeight;
			this.wIHID = this.inWidth * this.inHeight * this.inDepth;
			this.fWIH = this.filterWidth * this.filterHeight;
			this.fWIHID = this.inDepth * this.filterHeight * this.filterWidth;
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		inSizeDimensions() {
			return [this.inWidth, this.inHeight, this.inDepth];
		}

		outSizeDimensions() {
			return [
				Math.ceil((this.inWidth - this.filterWidth + 2 * this.padding + 1) / this.stride),
				Math.ceil((this.inHeight - this.filterHeight + 2 * this.padding + 1) / this.stride),
				this.filters,
			];
		}

		forward(inData) {
			if (inData) {
				if (inData.length != this.inSize()) {
					throw (
						'INPUT SIZE WRONG ON CONV LAYER:\nexpected array size (' +
						this.inSize() +
						', dimensions: [' +
						this.inSizeDimensions() +
						']), got: (' +
						inData.length +
						')'
					);
				}
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}
			this.outData.fill(0);

			for (var i = 0; i < this.filters; i++) {
				const iHMFWMF = i * this.hMFWMF;
				const iFWIHID = i * this.fWIHID;
				for (var g = 0; g < this.hMFHPO; g++) {
					const ga = g * this.stride;
					const gWMFWPO = g * this.wMFWPO;
					for (var b = 0; b < this.wMFWPO; b++) {
						const odi = b + gWMFWPO + iHMFWMF;
						const ba = b * this.stride;
						for (var h = 0; h < this.inDepth; h++) {
							const hWIH = h * this.wIH + ba;
							const hFWIH = h * this.fWIH + iFWIHID;
							for (var j = 0; j < this.filterHeight; j++) {
								const jGAIWBA = (j + ga) * this.inWidth + hWIH;
								const jFWHFWIH = j * this.filterWidth + hFWIH;
								for (var k = 0; k < this.filterWidth; k++) {
									this.outData[odi] += this.inData[k + jGAIWBA] * this.filterw[k + jFWHFWIH];
								}
							}
						}
						// this.outData[odi] += this.b[odi];
					}
				}
			}
		}

		backward(expected) {
			let loss = 0;
			this.trainIterations++;
			for (var i = 0; i < this.inSize(); i++) {
				//reset the costs
				this.costs[i] = 0;
			}

			if (!expected) {
				// -- sometimes the most effiecant way is the least elagant one...
				if (this.nextLayer == undefined) {
					throw 'error backproping on an unconnected layer with no expected parameter input';
				}
			}

			for (var i = 0; i < this.filters; i++) {
				const iHMFWMF = i * this.hMFWMF;
				const iFWIHID = i * this.fWIHID;
				for (var g = 0; g < this.hMFHPO; g++) {
					const ga = g * this.stride;
					const gWMFWPO = g * this.wMFWPO;
					for (var b = 0; b < this.wMFWPO; b++) {
						const odi = b + gWMFWPO + iHMFWMF;
						const ba = b * this.stride;
						let err = !expected ? this.nextLayer.costs[odi] : expected[odi] - this.outData[odi];
						loss += Math.pow(err, 2);
						for (var h = 0; h < this.inDepth; h++) {
							const hWIH = h * this.wIH;
							const hFWIH = h * this.fWIH + iFWIHID;
							for (var j = 0; j < this.filterHeight; j++) {
								const jGAIWBA = (j + ga) * this.inWidth + hWIH + ba;
								const jFWHFWIH = j * this.filterWidth + hFWIH;
								for (var k = 0; k < this.filterWidth; k++) {
									this.costs[k + jGAIWBA] += this.filterw[k + jFWHFWIH] * err;
									// this.accessed[k + jGAIWBA]++;
									this.filterws[k + jFWHFWIH] += this.inData[k + jGAIWBA] * err;
								}
							}
						}
						// this.bs[odi] += err;
					}
				}
			}

			// for (var i = 0; i < this.inSize(); i++) {
			// 	this.costs[i] =
			// 		this.costs[i] / (this.accessed[i] > 0 ? this.accessed[i] : 0);
			// 	this.accessed[i] = 0;
			// }

			return loss / (this.wMFWPO * this.hMFHPO * this.filters);
		}

		updateParams(optimizer) {
			for (var i = 0; i < this.filterw.length; i++) {
				// this.filterws[i] /= this.outSize() / this.filters;
				// this.filterws[i] /= this.trainIterations;
				this.filterw[i] += this.filterws[i] * this.lr;
				this.filterws[i] = 0;
			}
			//i forgor to update bias
			// for (var i = 0; i < this.b.length; i++) {
			// 	//is this correct i wonder?
			// 	this.bs[i] /= this.wMFWPO * this.hMFHPO * this.filters;
			// 	this.b[i] += this.bs[i] * this.lr;
			// 	this.bs[i] = 0;
			// }
			this.trainIterations = 0;
		}

		save() {
			let ret = JSON.stringify(this, function (key, value) {
				if (
					key == 'filterws' ||
					key == 'filterbs' ||
					key == 'inData' ||
					key == 'outData' ||
					key == 'costs' ||
					key == 'gpuEnabled' ||
					key == 'trainIterations' ||
					key == 'nextLayer' ||
					key == 'previousLayer'
				) {
					return undefined;
				}

				return value;
			});

			return ret;
		}

		static load(json) {
			//inWidth, inHeight, inDepth, filterWidth, filterHeight, filters = 3, stride = 1, padding = 0
			let saveObject = JSON.parse(json);
			let layer = new ConvLayer(
				saveObject.inWidth,
				saveObject.inHeight,
				saveObject.inDepth,
				saveObject.filterWidth,
				saveObject.filterHeight,
				saveObject.filters,
				saveObject.stride,
				saveObject.padding
			);
			for (var i = 0; i < layer.filterw.length; i++) {
				layer.filterw[i] = saveObject.filterw[i];
			}
			// for (var i = 0; i < layer.b.length; i++) {
			// 	layer.b[i] = saveObject.b[i];
			// }
			layer.lr = saveObject.lr;
			return layer;
		}
	}

	Ment.ConvLayer = ConvLayer;
	Ment.Conv = ConvLayer;
}
{
	/*
		Layer specification:

		Each layer needs an inData and outData array.
		These arrays should never be replaced because they are shared objects.
		This means never do this. "this.inData = [];" EXCEPT in the constructor.
		Replacing the inData or outData array will de-connect the layers.

		Each layer needs a "forward" and a "backward" function. The forward function should
		be able to take an input array as input or use the data in "this.inData." The same for the 
		backward function, it should take an array of "expected" values or it should backpropogate
		based on the cost of the next layer (this.nextLayer.costs).

		REQUIRED FUNCTIONS:
			inSize()
			outSize()
			forward(inData::array)
			backward(ExpectedOutput::array) -- returns loss of the layer (Expected - outData)^2
			updateParams(optimizer::string) // optimizer examples: "SGD" "adam" "adagrad" "adadelta"
			save() -- returns json string of layer

		REQUIRED STATIC FUNCTIONS:
			load(json) -- returns a layer  EX: FCLayer.load(layer.save()); //makes a copy of "layer"
			
		REQUIRED FEILDS:
			inData:Float32Array
			outData:Float32Array
			costs:Float32Array
			gpuEnabled:Boolean
			
			----Everything above is the bare minimum for your layer to work at all--------------
			
		NOT REQUIRED FUNCTIONS:
			inSizeDimensions() -- returns array of dimensions i.e. [28,28,3]
			outSizeDimensions()
			
		FEILDS SET BY NET OBJECT:
			lr -- aka learning rate 
			nextLayer -- a reference to the layer after
			previousLayer -- a reference to preceding layer		

		FUNCTIONS FOR EVOLOUTION BASED LEARNING TO WORK:
			mutate(mutationRate::float, mutationIntensity::float)

		FUNCTIONS FOR GPU SUPPORT TO WORK:
			initGPU() -- this should at least make "this.gpuEnabled" true.

			You can code the rest yourself, Mentnet uses gpujs and Ment.gpu is a 
			global gpu object to use to prevent making multpile gpu objects. 
			Make it work however you want.

			If you have all this your layer should work inside a real net!

		

	*/

	class FCLayer {
		constructor(inSize, outSize) {
			this.lr = 0.01; //learning rate, this will be set by the Net object
			//dont set it in the constructor unless you really want to

			this.gpuEnabled = false;
			this.trainIterations = 0; //++'d whenever backwards is called;
			this.ws = new Float32Array(inSize * outSize); //the weights sensitivities to error
			this.bs = new Float32Array(outSize); //the bias sensitivities to error
			this.nextLayer; //the connected layer
			this.inData = new Float32Array(inSize); //the inData
			this.outData = new Float32Array(outSize);
			this.w = new Float32Array(inSize * outSize); //this will store the weights
			this.b = new Float32Array(outSize); //this will store the biases (biases are for the outData (next layer))
			this.costs = new Float32Array(inSize); //costs for each neuron

			for (var j = 0; j < inSize; j++) {
				//----init random weights
				for (var h = 0; h < outSize; h++) {
					this.w[h + j * outSize] = 1 * Math.random() * (Math.random() > 0.5 ? -1 : 1);
					this.ws[h + j * outSize] = 0;
				}
			} // ---- end init weights

			for (var j = 0; j < outSize; j++) {
				this.b[j] = 1 * Math.random() * (Math.random() > 0.5 ? -1 : 1);
				this.bs[j] = 0;
			} ///---------adding random biases
		}

		forward(inData) {
			if (inData) {
				if (inData.length != this.inSize()) {
					throw 'INPUT SIZE WRONG ON FC LAYER:\nexpected size (' + this.inSize() + '), got: (' + inData.length + ')';
				}
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.outSize(); h++) {
				this.outData[h] = 0; //reset outData activation
				for (var j = 0; j < this.inSize(); j++) {
					this.outData[h] += this.inData[j] * this.w[h + j * this.outSize()]; // the dirty deed
				}
				this.outData[h] += this.b[h];
			}
		}

		backward(expected) {
			this.trainIterations++;
			let loss = 0;
			for (var i = 0; i < this.inSize(); i++) {
				//reset the costs
				this.costs[i] = 0;
			}

			if (!expected) {
				// -- sometimes the most effiecant way is the least elagant one...
				if (this.nextLayer == undefined) {
					throw 'error backproping on an unconnected layer with no expected parameter input';
				}
				for (var j = 0; j < this.outSize(); j++) {
					let err = this.nextLayer.costs[j];
					loss += Math.pow(err, 2);
					for (var i = 0; i < this.inSize(); i++) {
						//activation times error = change to the weight.
						this.ws[j + i * this.outSize()] += this.inData[i] * err * 2;
						this.costs[i] += this.w[j + i * this.outSize()] * err * 2;
					}
					//bias grad is real simple :)
					this.bs[j] += err;
				}
			} else {
				for (var j = 0; j < this.outSize(); j++) {
					let err = expected[j] - this.outData[j];
					loss += Math.pow(err, 2);
					for (var i = 0; i < this.inSize(); i++) {
						//activation times error = change to the weight.
						this.ws[j + i * this.outSize()] += this.inData[i] * err * 2;
						this.costs[i] += this.w[j + i * this.outSize()] * err * 2;
					}
					//bias grad is real simple :)
					this.bs[j] += err;
				}
			} // end of 'sometimes the most effeciant is the least elagant' ----

			//finish averaging the costs
			for (var i = 0; i < this.inSize(); i++) {
				this.costs[i] = this.costs[i] / this.outSize();
			}

			return loss / this.outSize();
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		updateParams(optimizer) {
			if (this.trainIterations < 0) {
				return;
			}
			if (optimizer == 'SGD') {
				for (var i = 0; i < this.ws.length; i++) {
					this.ws[i] /= this.trainIterations;
					this.w[i] += this.ws[i] * this.lr;
					this.ws[i] = 0;
				}

				for (var j = 0; j < this.outSize(); j++) {
					this.bs[j] /= this.trainIterations;
					this.b[j] += this.bs[j] * this.lr;
					this.bs[j] = 0;
				}

				this.trainIterations = 0;
			}
		}

		mutate(mutationRate, mutationIntensity) {
			for (var i = 0; i < this.w.length; i++) {
				if (Math.random() < mutationRate) {
					this.w[i] += Math.random() * mutationIntensity * (Math.random() > 0.5 ? -1 : 1);
				}
			}
			for (var i = 0; i < this.b.length; i++) {
				if (Math.random() < mutationRate) {
					this.b[i] += Math.random() * mutationIntensity * (Math.random() > 0.5 ? -1 : 1);
				}
			}
		}

		save() {
			// we cant see the length of arrays after saving them in JSON
			// for some reason so we are adding temp variables so we know
			// the sizes;
			this.savedInSize = this.inSize();
			this.savedOutSize = this.outSize();

			let ret = JSON.stringify(this, function (key, value) {
				//here we define what we need to save
				if (
					key == 'ws' ||
					key == 'bs' ||
					key == 'inData' ||
					key == 'outData' ||
					key == 'costs' ||
					key == 'gpuEnabled' ||
					key == 'trainIterations' ||
					key == 'nextLayer' ||
					key == 'previousLayer'
				) {
					return undefined;
				}

				return value;
			});

			//This is how you delete object properties btw.
			delete this.savedInSize;
			delete this.savedOutSize;

			return ret;
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new FCLayer(saveObject.savedInSize, saveObject.savedOutSize);
			for (var i = 0; i < layer.w.length; i++) {
				layer.w[i] = saveObject.w[i];
			}
			for (var i = 0; i < layer.b.length; i++) {
				layer.b[i] = saveObject.b[i];
			}
			layer.lr = saveObject.lr;
			return layer;
		}

		//----------------
		// GPU specific stuff below! Beware.
		//----------------

		// initGPU(){
		// 	this.forwardGPUKernel = Ment.gpu.createKernel(function(inData, weights, biases, outDataLength, inDataLength) {
		// 		var act = 0;
		// 		for (var j = 0; j < inDataLength; j++) {
		// 					act +=
		// 						inData[j] *
		// 						weights[this.thread.x + j *	outDataLength];// the dirty deed
		// 		}
		// 		act += biases[this.thread.x];
		// 		return act
		// 	}).setOutput([this.outData.length]);
		// }

		//----------------
		// End of GPU specific stuff. Take a breather.
		//----------------
	}

	Ment.FCLayer = FCLayer;
	Ment.FC = FCLayer;
}
{
	class IdentityLayer {
		//this layer outputs the inputs with no changes
		constructor(size) {
			this.nextLayer; //the connected layer
			this.inData = new Float32Array(size); //the inData
			this.outData = new Float32Array(size); //will be init when "connect" is called.
			this.costs = new Float32Array(size); //costs for each neuron
			this.pl; //reference to previous layer
		}

		get previousLayer() {
			return this.pl;
		}
		set previousLayer(layer) {
			// try to connect to it
			if (this.inData.length == 0) {
				//if not already initialized
				this.inData = new Float32Array(layer.outSize());
				this.outData = new Float32Array(layer.outSize());
				this.costs = new Float32Array(layer.outSize());
			}
			this.pl = layer;
		}
		forward(inData) {
			if (inData) {
				if (inData.length != this.inSize()) {
					throw 'INPUT SIZE WRONG ON (Input or output or linear) LAYER:\nexpected size (' + this.inSize() + '), got: (' + inData.length + ')';
				}
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.outSize(); h++) {
				this.outData[h] = this.inData[h];
			}
		}

		backward(expected) {
			let loss = 0;
			if (!expected) {
				if (this.nextLayer == undefined) {
					throw 'nothing to backpropagate!';
				}
				expected = [];
				for (var i = 0; i < this.outData.length; i++) {
					this.costs[i] = this.nextLayer.costs[i];
					loss += this.costs[i];
				}
			} else {
				for (var j = 0; j < this.outData.length; j++) {
					let err = expected[j] - this.outData[j];
					this.costs[j] = err;
					loss += Math.pow(err, 2);
				}
			}
			return loss / this.inSize();
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		save() {
			this.savedSize = this.inSize();

			let ret = JSON.stringify(this, function (key, value) {
				//here we define what we need to save
				if (key == 'inData' || key == 'outData' || key == 'costs' || key == 'nextLayer' || key == 'previousLayer') {
					return undefined;
				}

				return value;
			});

			//This is how you delete object properties btw.
			delete this.savedInSize;
			delete this.savedOutSize;

			return ret;
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new IdentityLayer(saveObject.savedSize);
			return layer;
		}
	}

	Ment.IdentityLayer = IdentityLayer;
	Ment.Identity = IdentityLayer;
	Ment.Input = IdentityLayer;
	Ment.DummyLayer = IdentityLayer;
	Ment.Dummy = IdentityLayer;
	Ment.InputLayer = IdentityLayer;
	Ment.OutputLayer = IdentityLayer;
	Ment.Output = IdentityLayer;
}
{
	class LeakyReluLayer extends Ment.ActivationBase {
		static leakySlope = 0.25;

		constructor(size) {
			super(size);
		}

		forward(inData) {
			if (inData) {
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.outSize(); h++) {
				this.outData[h] = this.inData[h] > 0 ? this.inData[h] : 0;
			}
			//Oh the misery
		}

		backward(expected) {
			let loss = 0;
			if (!expected) {
				if (this.nextLayer == undefined) {
					throw 'nothing to backpropagate!';
				}
				expected = [];
				for (var i = 0; i < this.outData.length; i++) {
					expected.push(this.nextLayer.costs[i] + this.nextLayer.inData[i]);
				}
			}

			for (var j = 0; j < this.outSize(); j++) {
				let err = expected[j] - this.outData[j];
				loss += Math.pow(err, 2);
				if (this.outData[j] >= 0) {
					this.costs[j] = err;
				} else {
					this.costs[j] = err * Ment.LeakyReluLayer.leakySlope;
				}
			}
			return loss / this.outSize();
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new LeakyReluLayer(saveObject.savedSize);
			return layer;
		}
	}
	Ment.LeakyReluLayer = LeakyReluLayer;
	Ment.LeakyRelu = LeakyReluLayer;
	Ment.LRelu = LeakyReluLayer;
}
{
	/*
if you wanna input an image do it like this.
[r,r,r,r,g,g,g,g,b,b,b,b,b]
NOT like this:
[r,g,b,r,g,b,r,g,b,r,g,b]

*/

	class MaxPoolLayer {
		constructor(inWidth, inHeight, inDepth, filterWidth, filterHeight, stride = 1, padding = 0) {
			if (padding != 0) {
				throw (
					'Dear user, I have not implemented padding yet.. set it to zero to avoid this message. ' +
					'Star the project if you want me to complete it. or send me 5 bucks ill do it right now.'
				);
			}
			this.inWidth = inWidth;
			this.inHeight = inHeight;
			this.inDepth = inDepth;
			this.filterWidth = filterWidth;
			this.filterHeight = filterHeight;
			this.stride = stride;
			this.padding = 0; //havent implemented padding yet
			this.outData = new Float32Array(Math.ceil((inWidth - filterWidth + 1) / stride) * Math.ceil((inHeight - filterHeight + 1) / stride) * this.inDepth);
			this.inData = new Float32Array(inWidth * inHeight * inDepth);
			this.costs = new Float32Array(inWidth * inHeight * inDepth);
			this.maxIndexes = new Float32Array(this.outData.length);
			this.accessed = new Float32Array(this.costs.length).fill(1);
			if (this.filterWidth > inWidth || this.filterHeight > inHeight) {
				throw 'Max Pool layer error: Pooling size (width / height) cannot be bigger than the inputs corresponding (width/height)';
			}

			//Everything below here is precalculated constants used in forward/backward
			//to optimize this and make sure we are as effeiciant as possible.
			//Change these for broken code!
			this.hMFHPO = Math.ceil((this.inHeight - this.filterHeight + 1) / this.stride);
			this.wMFWPO = Math.ceil((this.inWidth - this.filterWidth + 1) / this.stride);
			this.hMFWMF = this.hMFHPO * this.wMFWPO;
			this.wIH = this.inWidth * this.inHeight;
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		inSizeDimensions() {
			return [this.inWidth, this.inHeight, this.inDepth];
		}

		outSizeDimensions() {
			return [Math.ceil((this.inWidth - this.filterWidth + 1) / this.stride), Math.ceil((this.inHeight - this.filterHeight + +1) / this.stride), this.inDepth];
		}

		forward(inData) {
			if (inData) {
				if (inData.length != this.inSize()) {
					throw (
						'INPUT SIZE WRONG ON MAX POOL LAYER:\nexpected array size (' +
						this.inSize() +
						', dimensions: [' +
						this.inSizeDimensions() +
						']), got: (' +
						inData.length +
						')'
					);
				}
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}
			this.outData.fill(0);

			for (var g = 0; g < this.hMFHPO; g++) {
				const ga = g * this.stride;
				const gWMFWPO = g * this.wMFWPO;
				for (var b = 0; b < this.wMFWPO; b++) {
					const ba = b * this.stride;
					for (var h = 0; h < this.inDepth; h++) {
						const odi = b + gWMFWPO + h * this.hMFWMF;
						const hWIH = h * this.wIH + ba;
						let max = this.inData[ga * this.inWidth + hWIH];
						for (var j = 0; j < this.filterHeight; j++) {
							const jGAIWBA = (j + ga) * this.inWidth + hWIH;
							for (var k = 1; k < this.filterWidth; k++) {
								if (this.inData[k + jGAIWBA] > max) {
									max = this.inData[k + jGAIWBA];
									this.maxIndexes[odi] = k + jGAIWBA;
								}
							}
						}
						this.outData[odi] = max;
					}
				}
			}
		}

		backward(expected) {
			this.costs.fill(0);
			let loss = 0;

			if (!expected) {
				// -- sometimes the most effiecant way is the least elagant one...
				if (this.nextLayer == undefined) {
					throw 'error backproping on an unconnected layer with no expected parameter input';
				}
			}

			for (var g = 0; g < this.hMFHPO; g++) {
				const ga = g * this.stride;
				const gWMFWPO = g * this.wMFWPO;
				for (var b = 0; b < this.wMFWPO; b++) {
					const ba = b * this.stride;
					for (var h = 0; h < this.inDepth; h++) {
						const odi = b + gWMFWPO + h * this.hMFWMF;
						let err = !expected ? this.nextLayer.costs[odi] : expected[odi] - this.outData[odi];
						loss += Math.pow(err, 2);
						this.costs[this.maxIndexes[odi]] += err;
						this.accessed[this.maxIndexes[odi]]++;
					}
				}
			}

			// for (var i = 0; i < this.inSize(); i++) {
			// 	this.costs[i] = this.costs[i] / (this.accessed[i] > 0 ? this.accessed[i] : 1);
			// 	this.accessed[i] = 0;
			// }
			return loss / (this.hMFHPO * this.wMFWPO * this.inDepth);
		}

		save() {
			let ret = JSON.stringify(this, function (key, value) {
				if (
					key == 'inData' ||
					key == 'outData' ||
					key == 'costs' ||
					key == 'gpuEnabled' ||
					key == 'trainIterations' ||
					key == 'nextLayer' ||
					key == 'previousLayer'
				) {
					return undefined;
				}

				return value;
			});

			return ret;
		}

		static load(json) {
			//inWidth, inHeight, inDepth, filterWidth, filterHeight, stride = 1, padding = 0
			let saveObject = JSON.parse(json);
			let layer = new MaxPoolLayer(
				saveObject.inWidth,
				saveObject.inHeight,
				saveObject.inDepth,
				saveObject.filterWidth,
				saveObject.filterHeight,
				saveObject.stride,
				saveObject.padding
			);
			return layer;
		}
	}

	Ment.MaxPoolLayer = MaxPoolLayer;
	Ment.MaxPool = MaxPoolLayer;
}
{
	class ReluLayer extends Ment.ActivationBase {
		constructor(size) {
			super(size);
		}

		forward(inData) {
			if (inData) {
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.outSize(); h++) {
				this.outData[h] = this.inData[h] > 0 ? this.inData[h] : 0;
			}
			//Oh the misery
		}

		backward(expected) {
			let loss = 0;
			if (!expected) {
				if (this.nextLayer == undefined) {
					throw 'nothing to backpropagate!';
				}
				expected = [];
				for (var i = 0; i < this.outData.length; i++) {
					expected.push(this.nextLayer.costs[i] + this.nextLayer.inData[i]);
				}
			}

			for (var j = 0; j < this.outSize(); j++) {
				let err = expected[j] - this.outData[j];
				loss += Math.pow(err, 2);
				if (this.outData[j] >= 0) {
					this.costs[j] = err;
				}
			}
			return loss / this.outSize();
		}
		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new ReluLayer(saveObject.savedSize);
			return layer;
		}
	}

	Ment.ReluLayer = ReluLayer;
	Ment.Relu = ReluLayer;
}
{
	class ResEmitterLayer {
		//this layer outputs the inputs with no changes
		constructor(size, id) {
			this.id = id || 0;
			this.nextLayer; //the connected layer
			this.inData = new Float64Array(size); //the inData
			this.outData = new Float64Array(size); //will be init when "connect" is called.
			this.costs = new Float64Array(size); //costs for each neuron
			this.receiver; // a reference to the receiver layer so we can skip layers
			//this will be set by the receiver  when the net is initialized
		}

		forward(inData) {
			if (inData) {
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.outSize(); h++) {
				this.outData[h] = this.inData[h];
			}
		}

		backward(expected) {
			let loss = 0;
			this.costs.fill(0);
			if (!expected) {
				if (this.nextLayer == undefined) {
					throw 'nothing to backpropagate!';
				}
				expected = [];
				for (var i = 0; i < this.outData.length; i++) {
					this.costs[i] += this.nextLayer.costs[i];
					this.costs[i] += this.receiver.costsForEmitter[i];
					this.costs[i] /= 2;
					loss += this.costs[i];
				}
			} else {
				//this code should never run tbh
				for (var j = 0; j < this.outData.length; j++) {
					let err = expected[j] - this.outData[j];
					this.costs[j] += err;
					loss += Math.pow(err, 2);
				}
			}
			return loss / this.inSize();
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		save() {
			this.savedSize = this.inSize();

			let ret = JSON.stringify(this, function (key, value) {
				//here we define what we need to save
				if (key == 'receiver' || key == 'inData' || key == 'outData' || key == 'costs' || key == 'nextLayer' || key == 'previousLayer') {
					return undefined;
				}

				return value;
			});

			//This is how you delete object properties btw.
			delete this.savedInSize;
			delete this.savedOutSize;

			return ret;
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new ResEmitterLayer(saveObject.savedSize, saveObject.id);
			return layer;
		}
	}

	Ment.ResEmitterLayer = ResEmitterLayer;
	Ment.ResEmitter = ResEmitterLayer;
	Ment.Emitter = ResEmitterLayer;
}
{
	class ResReceiverLayer {
		//this layer outputs the inputs with no changes
		constructor(id) {
			this.id = id || 0;
			this.nextLayer; //the connected layer
			this.inData; //the inData
			this.outData; //will be init when "onConnect" is called.
			this.costs; //costs for each neuron
			this.emitter;
			this.inDataFromEmitter;
			this.costsForEmitter;
			this.pl; // holds a reference to previous layer
		}

		get previousLayer() {
			return this.pl;
		}

		set previousLayer(layer) {
			this.inData = new Float32Array(layer.outSize());
			this.costs = new Float32Array(layer.outSize());
			this.pl = layer;
			//time to find this layers soulmate
			let found = false;
			let currentLayer = layer; //start at this layer go forward until find a reciever with the same ID
			while (!found) {
				if (currentLayer.id == this.id && currentLayer.constructor == Ment.ResEmitter) {
					found = true;
				} else {
					currentLayer = currentLayer.previousLayer;
					if (currentLayer == undefined) {
						throw 'Could not find Matching Emitter Layer for Receiver Layer ID: ' + this.id;
					}
				}
			}
			this.emitter = currentLayer;
			this.inDataFromEmitter = this.emitter.outData;
			currentLayer.receiver = this; //so they can find each other again :)
			this.outData = new Float32Array(layer.outSize() + this.emitter.outSize());
			this.costsForEmitter = new Float32Array(this.emitter.outSize());
		}

		forward(inData) {
			if (inData) {
				if (inData.length != this.inSize()) {
					throw 'INPUT SIZE WRONG ON (Input or output or linear) LAYER:\nexpected size (' + this.inSize() + '), got: (' + inData.length + ')';
				}
				for (var i = 0; i < inData.length; i++) {
					this.inData[i] = inData[i];
				}
			}

			for (var h = 0; h < this.inData.length; h++) {
				this.outData[h] = this.inData[h];
			}
			for (var h = this.inData.length; h < this.inData.length + this.inDataFromEmitter.length; h++) {
				this.outData[h] = this.inDataFromEmitter[h - this.inData.length];
			}
		}

		backward(expected) {
			let loss = 0;
			if (!expected) {
				if (this.nextLayer == undefined) {
					throw 'nothing to backpropagate!';
				}
				for (var i = 0; i < this.inData.length; i++) {
					this.costs[i] = this.nextLayer.costs[i];
					loss += this.costs[i];
				}
				for (var i = this.inData.length; i < this.inData.length + this.inDataFromEmitter.length; i++) {
					this.costsForEmitter[i - this.inData.length] = this.nextLayer.costs[i];
					loss += this.costsForEmitter[i - this.inData.length];
				}
			} else {
				for (var j = 0; j < this.inData.length; j++) {
					let err = expected[j] - this.outData[j];
					this.costs[j] = err;
					loss += Math.pow(err, 2);
				}
				for (var i = this.inData.length; i < this.inData.length + this.inDataFromEmitter.length; i++) {
					this.costsForEmitter[i - this.inData.length] = expected[i] - this.outData[i];
					loss += this.costsForEmitter[i - this.inData.length];
				}
			}
			return loss / this.inSize();
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		save() {
			let ret = JSON.stringify(this, function (key, value) {
				//here we define what we need to save
				if (key == 'emitter' || key == 'inData' || key == 'outData' || key == 'costs' || key == 'nextLayer' || key == 'previousLayer') {
					return undefined;
				}

				return value;
			});
			return ret;
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new ResReceiverLayer(saveObject.id);
			return layer;
		}
	}

	Ment.ResReceiverLayer = ResReceiverLayer;
	Ment.ResReceiver = ResReceiverLayer;
	Ment.Receiver = ResReceiverLayer;
}
{
	class SigmoidLayer extends Ment.ActivationBase {
		sigmoid(z) {
			return 1 / (1 + Math.exp(-z));
		}

		sigmoidPrime(z) {
			return Math.exp(-z) / Math.pow(1 + Math.exp(-z), 2);
		}

		constructor(size) {
			super(size);
		}

		forward(inData) {
			super.forward(inData, this.sigmoid);
		}

		backward(expected) {
			super.backward(expected, this.sigmoidPrime);
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new SigmoidLayer(saveObject.savedSize);
			return layer;
		}
	}

	Ment.SigmoidLayer = SigmoidLayer;
	Ment.Sigmoid = SigmoidLayer;
	Ment.Sig = SigmoidLayer;
}
{
	class SineLayer extends Ment.ActivationBase {
		sine(z) {
			return Math.sin(z);
		}

		sinePrime(z) {
			return Math.cos(z);
		}

		constructor(size) {
			super(size);
		}

		forward(inData) {
			super.forward(inData, this.sine);
		}

		backward(expected) {
			super.backward(expected, this.sinePrime);
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}
		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new SineLayer(saveObject.savedSize);
			return layer;
		}
	}

	Ment.SineLayer = SineLayer;
	Ment.Sine = SineLayer;
	Ment.Sin = SineLayer;
}
{
	class TanhLayer extends Ment.ActivationBase {
		tanh(z) {
			return Math.tanh(z);
		}

		tanhPrime(z) {
			return 1 - Math.pow(Math.tanh(z), 2);
		}

		constructor(size) {
			super(size);
		}

		forward(inData) {
			super.forward(inData, this.tanh);
		}

		backward(expected) {
			super.backward(expected, this.tanhPrime);
		}

		inSize() {
			return this.inData.length;
		}

		outSize() {
			return this.outData.length;
		}

		static load(json) {
			let saveObject = JSON.parse(json);
			let layer = new TanhLayer(saveObject.savedSize);
			return layer;
		}
	}

	Ment.TanhLayer = TanhLayer;
	Ment.Tanh = TanhLayer;
}
