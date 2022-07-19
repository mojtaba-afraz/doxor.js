# doxor.js
<p align="center">
  <img src="https://i.ibb.co/TgBQ8TR/doxor.png" width="350" alt="logo"/>
  <br/> 
    <b>Offline database in Front-End <br/> library for interacting with IndexedDB<b/>

</p>
<hr/>

## Install Doxor.js using npm

```
npm i doxor.js
```

## Creating a database

```javascript
import Doxor from "doxor.js"


const dbName = new Doxor('dbName')
```

## Specify the structure

```javascript
const usersCollection = {
    name: 'users',
    indexes: [
        {
            key: 'name',
            unique: false
        },
        {
            key: 'email',
            unique: true
        }
    ]
}

dbName.Store(usersCollection)
```

<p>
<b>name :</b> Collection name<br/>
<b>indexes [array of objects] :</b> Each object carries collection field properties<br/>

</p>

### result:
<p align="center">
<img src="https://i.ibb.co/wWzm8LH/Screen-Shot-2022-07-18-at-11-27-18-PM.png"/>
</p>

## Insert Record

```javascript
dbName.Insert('users',{name:"john",email:"john@email.com"})
```

## Get Record

```javascript
dbName.get('users',1,result => {
    console.log(result)
})
```

## Get All Records

```javascript
dbName.getAll('users',result => {
    console.log(result)
})
```

## remove Record

```javascript
dbName.remove('users',1)
```


