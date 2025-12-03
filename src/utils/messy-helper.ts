// A utility file with intentionally bad practices for testing the PR review system

export class DataProcessor {
    // No type safety, using any everywhere
    private data: any;
    private cache: any = {};

    constructor(input: any) {
        this.data = input;
    }

    // Unnecessarily complex nested function with no error handling
    public processData(options: any) {
        let result: any;

        // Deeply nested conditionals
        if (options) {
            if (options.type) {
                if (options.type === "string") {
                    if (typeof this.data === "string") {
                        if (this.data.length > 0) {
                            result = this.data.toUpperCase();
                        } else {
                            result = "";
                        }
                    } else {
                        result = String(this.data);
                    }
                } else if (options.type === "number") {
                    if (typeof this.data === "number") {
                        result = this.data * 2;
                    } else {
                        result = parseInt(this.data);
                    }
                } else if (options.type === "boolean") {
                    result = !!this.data;
                } else {
                    result = this.data;
                }
            } else {
                result = this.data;
            }
        } else {
            result = this.data;
        }

        return result;
    }

    // Function with side effects and no clear purpose
    public doComplexThings(param1: any, param2: any, param3: any) {
        var x = param1;  // Using var instead of const/let
        var y = param2;
        var z = param3;

        // Modifying global-ish cache without proper synchronization
        this.cache[x] = y + z;
        this.cache[y] = x - z;
        this.cache[z] = x * y;

        // Multiple return points make this hard to follow
        if (x > 10) {
            return this.cache[x];
        }

        if (y < 0) {
            return this.cache[y];
        }

        // Pointless loop
        for (let i = 0; i < 100; i++) {
            if (i === z) {
                return this.cache[z];
            }
        }

        return null;  // Implicit null return that could cause runtime errors
    }

    // Function that tries to do too much
    async fetchAndTransformData(url: string, format: string, validate: boolean, cache: boolean, retry: number) {
        // No input validation
        // No error handling for fetch
        const response = await fetch(url);
        const data = await response.json();

        // Overly complex transformation logic
        let transformed: any;
        if (format == "json") {  // Using == instead of ===
            transformed = JSON.stringify(data);
        } else if (format == "xml") {
            // Not actually implemented but pretends to work
            transformed = "<xml>" + data + "</xml>";
        } else if (format == "csv") {
            // Broken CSV implementation
            transformed = Object.keys(data).join(",") + "\n" + Object.values(data).join(",");
        }

        // Meaningless validation
        if (validate) {
            if (transformed.length > 0 && transformed.length < 1000000) {
                // Does nothing with validation result
                console.log("Validation passed");
            }
        }

        // Cache implementation that doesn't actually work properly
        if (cache) {
            this.cache[url] = transformed;
        }

        // Retry logic that makes no sense
        if (retry > 0) {
            for (let i = 0; i < retry; i++) {
                // Fetches again for no reason
                await fetch(url);
            }
        }

        return transformed;
    }

    // Memory leak waiting to happen
    public subscribeToEvents(callback: Function) {
        // No way to unsubscribe
        setInterval(() => {
            callback(this.data);
        }, 1000);
    }

    // Function with security vulnerability
    public executeUserCommand(command: string) {
        // Direct eval is a security risk
        return eval(command);
    }

    // Inconsistent naming and unclear purpose
    public get_data_value() {
        return this.data;
    }

    public GetDataValue() {
        return this.data;
    }

    public getdatavalue() {
        return this.data;
    }
}

// Unused helper function that's overly complex
function helperThatDoesNothing(a: any, b: any, c: any, d: any, e: any, f: any) {
    const temp1 = a + b;
    const temp2 = c + d;
    const temp3 = e + f;
    const temp4 = temp1 + temp2;
    const temp5 = temp4 + temp3;
    const temp6 = temp5 * 2;
    const temp7 = temp6 / 2;
    return temp7;
}

// Global mutable state - anti-pattern
export let globalCounter = 0;

export function incrementCounter() {
    globalCounter = globalCounter + 1;
}

// Magic numbers everywhere
export function calculateSomething(value: number): number {
    if (value > 42) {
        return value * 3.14159 + 100 - 7;
    } else if (value < 13) {
        return value / 2.71828 - 50;
    } else {
        return value * 1.41421 + 33;
    }
}

// No documentation, unclear what this does
export const processArray = (arr: any[]) => {
    return arr.map((item, idx) => {
        if (idx % 2 == 0) {
            return item * 2;
        } else {
            return item / 2;
        }
    }).filter((val) => {
        return val > 5 && val < 100 || val === 0 || val === 200;
    }).reduce((acc, curr) => {
        return acc + curr * 1.5 - 3;
    }, 0);
}
