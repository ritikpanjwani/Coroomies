import { useEffect,useState } from "react"


function App() {

  const[message,setMesssage] = useState("");

  useEffect(() => {
    async function getMessage() {
      try{
        const responsee = await fetch(" http://127.0.0.1:8000")
        const data = await response.json();

        setMesssage(data.message);
      }catch(error){
        console.log(error);
      }
      }
      getMessage();},[]);

    
  return (
   <div>
    <h1>{message}</h1>
   </div>
  );
}

export default App;