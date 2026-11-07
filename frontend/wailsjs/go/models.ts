export namespace main {
	
	export class Layout {
	    name: string;
	    path: string;
	    uvs: number[];
	    islands: number[];
	
	    static createFrom(source: any = {}) {
	        return new Layout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.uvs = source["uvs"];
	        this.islands = source["islands"];
	    }
	}

}

