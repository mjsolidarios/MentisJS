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
