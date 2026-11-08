export namespace main {
	
	export class Layout {
	    name: string;
	    path: string;
	    uvs: number[];
	    islands: number[];
	    positions: number[];
	
	    static createFrom(source: any = {}) {
	        return new Layout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.uvs = source["uvs"];
	        this.islands = source["islands"];
	        this.positions = source["positions"];
	    }
	}
	export class SaveRequest {
	    path: string;
	    manifest: string;
	    files: Record<string, string>;
	    disk: Record<string, string>;
	    keep: string[];
	    from: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.manifest = source["manifest"];
	        this.files = source["files"];
	        this.disk = source["disk"];
	        this.keep = source["keep"];
	        this.from = source["from"];
	    }
	}

}

