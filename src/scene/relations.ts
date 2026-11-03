function checkSceneRelations(recipe:SemanticPlan,placements:ScenePlacement[],width:number,height:number):void {
  const ordered=[...recipe.items].sort((a,b)=>a.layer-b.layer);
  const lookup=(id:string)=>{const index=ordered.findIndex(i=>i.instanceId===id),p=placements[index],b=p.bounds;return {x:(b.x+b.width/2)/width,y:(b.y+b.height/2)/height,left:b.x/width,right:(b.x+b.width)/width,top:b.y/height,bottom:(b.y+b.height)/height,layer:ordered[index].layer,rotation:p.rotation};};
  for(const r of recipe.relations||[]){
    const a=lookup(r.subject),b=lookup(r.targets[0]||r.subject);let valid=false;
    switch(r.type){
      case 'leftOf':valid=a.x<b.x-.02;break;
      case 'rightOf':valid=a.x>b.x+.02;break;
      case 'above':valid=a.y<b.y-.02;break;
      case 'below':valid=a.y>b.y+.02;break;
      case 'near':valid=Math.hypot(a.x-b.x,a.y-b.y)<=.40;break;
      case 'farFrom':valid=Math.hypot(a.x-b.x,a.y-b.y)>=.45;break;
      case 'diagonalTo':valid=Math.abs(a.x-b.x)>=.08&&Math.abs(a.y-b.y)>=.08;break;
      case 'alignedLeft':valid=Math.abs(a.left-b.left)<=.025;break;
      case 'alignedRight':valid=Math.abs(a.right-b.right)<=.025;break;
      case 'alignedTop':valid=Math.abs(a.top-b.top)<=.025;break;
      case 'alignedBottom':valid=Math.abs(a.bottom-b.bottom)<=.025;break;
      case 'centeredX':valid=Math.abs(a.x-.5)<=.025;break;
      case 'centeredY':valid=Math.abs(a.y-.5)<=.025;break;
      case 'centered':valid=Math.abs(a.x-.5)<=.025&&Math.abs(a.y-.5)<=.025;break;
      case 'sameRotation':valid=Math.abs(((a.rotation-b.rotation+540)%360)-180)<=2;break;
      case 'oppositeRotation':valid=Math.abs(Math.abs(((a.rotation-b.rotation+540)%360)-180)-180)<=5;break;
      case 'alignedX':valid=Math.abs(a.x-b.x)<=.025;break;
      case 'alignedY':valid=Math.abs(a.y-b.y)<=.025;break;
      case 'inFrontOf':valid=a.layer>b.layer;break;
      case 'behind':valid=a.layer<b.layer;break;
      case 'tiltedToward':valid=Math.abs(a.x-b.x)>.05&&Math.abs(a.rotation)>=1&&Math.abs(a.rotation)<=60&&Math.abs(b.rotation)>=1&&Math.abs(b.rotation)<=60&&(a.x<b.x?a.rotation>0&&b.rotation<0:a.rotation<0&&b.rotation>0);break;
      case 'equalDistance':{
        const c=lookup(r.targets[1]);valid=Math.hypot(b.x-c.x,b.y-c.y)>=.1&&Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(a.x-c.x,a.y-c.y))<=.025;break;
      }
      case 'between':case 'centeredBetween':{
        const c=lookup(r.targets[1]),dx=c.x-b.x,dy=c.y-b.y,length=dx*dx+dy*dy;
        const t=length?((a.x-b.x)*dx+(a.y-b.y)*dy)/length:0;
        valid=length>=.01&&t>=(r.type==='centeredBetween'?.45:.1)&&t<=(r.type==='centeredBetween'?.55:.9)&&Math.hypot(a.x-b.x-t*dx,a.y-b.y-t*dy)<=.06;
        break;
      }
    }
    if(!valid)throw new Error(`План ИИ нарушает правило ${r.type}: ${r.subject} → ${r.targets.join(', ')}. Попробуйте новый вариант или уточните расположение.`);
  }
}

